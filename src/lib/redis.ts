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

const REDIS_TIMEOUT_MS = 500;

function encodeCommand(args: string[]): string {
  return `*${args.length}\r\n${args
    .map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`)
    .join("")}`;
}

function parseSimpleString(payload: string): string {
  return payload.slice(1, -2);
}

function parseInteger(payload: string): number {
  return Number(payload.slice(1, -2));
}

function parseBulkString(payload: string): string | null {
  const firstLineEnd = payload.indexOf("\r\n");
  const length = Number(payload.slice(1, firstLineEnd));

  if (length === -1) {
    return null;
  }

  return payload.slice(firstLineEnd + 2, firstLineEnd + 2 + length);
}

function parseResponse(payload: string): string | number | null {
  if (payload.startsWith("+")) {
    return parseSimpleString(payload);
  }

  if (payload.startsWith(":")) {
    return parseInteger(payload);
  }

  if (payload.startsWith("$")) {
    return parseBulkString(payload);
  }

  if (payload.startsWith("-")) {
    throw new Error(payload.slice(1, -2));
  }

  throw new Error("Respuesta invalida de Redis");
}

function createSocket(options: RedisConnectionOptions): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
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

    socket.setTimeout(REDIS_TIMEOUT_MS, () => {
      socket.destroy(new Error("Tiempo de espera agotado en Redis"));
    });

    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      resolve(socket);
    });
  });
}

function readResponse(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Conexion Redis cerrada antes de responder"));
    };

    const tryResolve = (): boolean => {
      if (buffer.length < 3) {
        return false;
      }

      const prefix = buffer[0];

      if (prefix === "+" || prefix === "-" || prefix === ":") {
        const end = buffer.indexOf("\r\n");
        if (end === -1) {
          return false;
        }
        cleanup();
        resolve(buffer.slice(0, end + 2));
        return true;
      }

      if (prefix === "$") {
        const lineEnd = buffer.indexOf("\r\n");
        if (lineEnd === -1) {
          return false;
        }

        const length = Number(buffer.slice(1, lineEnd));
        if (length === -1) {
          cleanup();
          resolve(buffer.slice(0, lineEnd + 2));
          return true;
        }

        const fullLength = lineEnd + 2 + length + 2;
        if (buffer.length < fullLength) {
          return false;
        }

        cleanup();
        resolve(buffer.slice(0, fullLength));
        return true;
      }

      return false;
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      tryResolve();
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function sendCommand(
  socket: net.Socket,
  args: string[]
): Promise<string | number | null> {
  socket.write(encodeCommand(args));
  const response = await readResponse(socket);
  return parseResponse(response);
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

async function withRedisConnection<T>(
  callback: (socket: net.Socket) => Promise<T>
): Promise<T> {
  const options = getRedisConnectionOptions();
  const socket = await createSocket(options);

  try {
    if (options.password) {
      if (options.username) {
        await sendCommand(socket, ["AUTH", options.username, options.password]);
      } else {
        await sendCommand(socket, ["AUTH", options.password]);
      }
    }

    return await callback(socket);
  } finally {
    socket.end();
  }
}

export async function incrementRateLimit(
  key: string,
  windowSeconds: number
): Promise<number> {
  return withRedisConnection(async (socket) => {
    const currentCount = await sendCommand(socket, ["INCR", key]);

    if (typeof currentCount !== "number") {
      throw new Error("Redis devolvio un contador invalido");
    }

    if (currentCount === 1) {
      await sendCommand(socket, ["EXPIRE", key, String(windowSeconds)]);
    }

    return currentCount;
  });
}

export async function getJsonValue<T>(key: string): Promise<T | null> {
  return withRedisConnection(async (socket) => {
    const value = await sendCommand(socket, ["GET", key]);

    if (value === null) {
      return null;
    }

    if (typeof value !== "string") {
      throw new Error("Redis devolvio un valor invalido");
    }

    return JSON.parse(value) as T;
  });
}

export async function setJsonValue(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  await withRedisConnection(async (socket) => {
    await sendCommand(socket, [
      "SET",
      key,
      JSON.stringify(value),
      "EX",
      String(ttlSeconds),
    ]);
  });
}
