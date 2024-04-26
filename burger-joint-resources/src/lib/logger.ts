import pino from "pino";

export const getLogger = (name: string) => pino({ name, level: "debug" });
