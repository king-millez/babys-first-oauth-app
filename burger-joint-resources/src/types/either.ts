type Right<T> = { kind: "right"; value: T };
type Left<T> = { kind: "left"; error: T };

export const right = <T>(value: T): Right<T> => ({
  kind: "right" as const,
  value,
});

export const left = <T>(error: T): Left<T> => ({
  kind: "left" as const,
  error,
});

export const isRight = <L, R>(either: Either<L, R>): either is Right<R> =>
  either.kind === "right";

export const isLeft = <L, R>(either: Either<L, R>): either is Left<L> =>
  either.kind === "left";

export type Either<L, R> = Right<R> | Left<L>;
