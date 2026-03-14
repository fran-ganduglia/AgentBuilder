import "server-only";

import net from "node:net";
import tls from "node:tls";
import { env } from "@/lib/utils/env";

type RedisConnectionOptions = {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  useTls: boolean;
};

type RedisValue = string | number | null | RedisValue[];

type ParsedRedisValue = {
  value: RedisValue;
  nextOffset: number;
};

export type RedisSubscription = {
  close: () => Promise<void>;
};

export const EVENT_QUEUE_NOTIFY_CHANNEL = "event_queue:notify";

const REDIS_CONNECT_TIMEOUT_MS = 2_000;

function encodeCommand(args: string[]): string {
  return `*${args.length}\r\n${args
    .map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`)
    .join("")}`;
}

function parseRedisValue(buffer: string, offset = 0): ParsedRedisValue | null {
  if (offset >= buffer.length) {
    return null;
  }

  const prefix = buffer[offset];
  const lineEnd = buffer.indexOf("\r\n", offset);

  if (lineEnd === -1) {
    return null;
  }

  if (prefix === "+" || prefix === "-") {
    const value = buffer.slice(offset + 1, lineEnd);
    if (prefix === "-") {
      throw new Error(value);
    }

    return {
      value,
      nextOffset: lineEnd + 2,
    };
  }

  if (prefix === ":") {
    return {
      value: Number(buffer.slice(offset + 1, lineEnd)),
      nextOffset: lineEnd + 2,
    };
  }

  if (prefix === "$") {
    const length = Number(buffer.slice(offset + 1, lineEnd));

    if (length === -1) {
      return {
        value: null,
        nextOffset: lineEnd + 2,
      };
    }

    const bodyStart = lineEnd + 2;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd + 2) {
      return null;
    }

    return {
      value: buffer.slice(bodyStart, bodyEnd),
      nextOffset: bodyEnd + 2,
    };
  }

  if (prefix === "*") {
    const count = Number(buffer.slice(offset + 1, lineEnd));

    if (count === -1) {
      return {
        value: null,
        nextOffset: lineEnd + 2,
      };
    }

    const values: RedisValue[] = [];
    let cursor = lineEnd + 2;

    for (let index = 0; index < count; index += 1) {
      const parsedChild = parseRedisValue(buffer, cursor);
      if (!parsedChild) {
        return null;
      }
      values.push(parsedChild.value);
      cursor = parsedChild.nextOffset;
    }

    return {
      value: values,
      nextOffset: cursor,
    };
  }

  throw new Error("Respuesta invalida de Redis");
}

function getRedisConnectionOptions(): RedisConnectionOptions {
  const url = new URL(env.REDIS_URL);

  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379)),
    username: url.username || null,
    password: url.password || null,
    useTls: url.protocol === "rediss:",
  };
}

function createSocket(options: RedisConnectionOptions): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = options.useTls
      ? tls.connect({
          host: options.host,
          port: options.port,
          servername: options.host,
        })
      : net.createConnection({
          host: options.host,
          port: options.port,
        });

    const onError = (error: Error) => {
      socket.off("connect", onConnect);
      reject(error);
    };

    const onConnect = () => {
      socket.off("error", onError);
      socket.setTimeout(0);
      resolve(socket);
    };

    socket.setTimeout(REDIS_CONNECT_TIMEOUT_MS, () => {
      socket.destroy(new Error("Tiempo de espera agotado en Redis"));
    });

    socket.once("error", onError);
    socket.once("connect", onConnect);
  });
}

function readSingleResponse(socket: net.Socket): Promise<RedisValue> {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");

      try {
        const parsed = parseRedisValue(buffer);
        if (!parsed) {
          return;
        }

        cleanup();
        resolve(parsed.value);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Conexion Redis cerrada antes de responder"));
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function sendCommand(socket: net.Socket, args: string[]): Promise<RedisValue> {
  socket.write(encodeCommand(args));
  return readSingleResponse(socket);
}

async function authenticate(socket: net.Socket, options: RedisConnectionOptions): Promise<void> {
  if (!options.password) {
    return;
  }

  if (options.username) {
    await sendCommand(socket, ["AUTH", options.username, options.password]);
    return;
  }

  await sendCommand(socket, ["AUTH", options.password]);
}

function isRedisMessagePayload(value: RedisValue): value is RedisValue[] {
  return Array.isArray(value);
}

function readMessageType(value: RedisValue): string | null {
  return typeof value === "string" ? value : null;
}

export async function publishEventQueueNotification(): Promise<number> {
  const options = getRedisConnectionOptions();
  const socket = await createSocket(options);

  try {
    await authenticate(socket, options);
    const response = await sendCommand(socket, ["PUBLISH", EVENT_QUEUE_NOTIFY_CHANNEL, "1"]);

    if (typeof response !== "number") {
      throw new Error("Redis devolvio una respuesta invalida a PUBLISH");
    }

    return response;
  } finally {
    socket.end();
  }
}

export async function subscribeEventQueueNotifications(
  onNotify: () => void,
  onError?: (error: Error) => void
): Promise<RedisSubscription> {
  const options = getRedisConnectionOptions();
  const socket = await createSocket(options);
  let buffer = "";
  let closed = false;

  try {
    await authenticate(socket, options);
    await sendCommand(socket, ["SUBSCRIBE", EVENT_QUEUE_NOTIFY_CHANNEL]);
  } catch (error) {
    socket.destroy();
    throw error;
  }

  const handleError = (error: Error) => {
    if (closed) {
      return;
    }
    onError?.(error);
  };

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");

    while (buffer.length > 0) {
      let parsed: ParsedRedisValue | null;

      try {
        parsed = parseRedisValue(buffer);
      } catch (error) {
        handleError(error instanceof Error ? error : new Error("Respuesta invalida de Redis"));
        return;
      }

      if (!parsed) {
        return;
      }

      buffer = buffer.slice(parsed.nextOffset);

      if (!isRedisMessagePayload(parsed.value)) {
        continue;
      }

      const [messageType, channelName] = parsed.value;
      if (
        readMessageType(messageType) === "message" &&
        readMessageType(channelName) === EVENT_QUEUE_NOTIFY_CHANNEL
      ) {
        onNotify();
      }
    }
  });

  socket.on("error", (error) => {
    handleError(error instanceof Error ? error : new Error("Redis cerro con error"));
  });

  socket.on("close", () => {
    if (closed) {
      return;
    }
    handleError(new Error("Suscripcion Redis cerrada"));
  });

  return {
    close: async () => {
      if (closed) {
        return;
      }

      closed = true;

      await new Promise<void>((resolve) => {
        socket.once("close", () => resolve());
        socket.end();
      });
    },
  };
}
