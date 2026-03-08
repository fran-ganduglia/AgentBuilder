"use client";

import { useContext } from "react";
import { ToastContext } from "@/components/ui/toast-provider";

export function useToast() {
  return useContext(ToastContext);
}
