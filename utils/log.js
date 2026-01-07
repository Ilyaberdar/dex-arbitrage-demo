import dotenv from "dotenv";
import winston, { createLogger, format, transports } from "winston";

dotenv.config();

const colorizer = format.colorize();

colorizer.addColors({
  info: "cyan",
  warn: "yellow",
  error: "magenta",
  engine: "green"
});

const logFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.errors({ stack: true }),
  format.splat(),
  format.printf(({ timestamp, level, message, stack, label }) => {
    const category = label || level;
    const base = `${timestamp} [${category.toUpperCase()}]: ${stack || message}`;
    return colorizer.colorize(level, base);
  })
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    new transports.Console(),

    new transports.File({ filename: "logs/combined.log" }),
    new transports.File({ filename: "logs/error.log", level: "error" }),

    new transports.File({
      filename: "logs/engine.log",
      level: "info",
      format: format.combine(
        format((info) => (info.label === "engine" ? info : false))(), // Фильтр
        logFormat
      )
    })
  ],

  exceptionHandlers: [new transports.File({ filename: "logs/exceptions.log" })],
  rejectionHandlers: [new transports.File({ filename: "logs/rejections.log" })],
});

function getLogger(label) {
  return logger.child({ label });
}

export { logger, getLogger };
