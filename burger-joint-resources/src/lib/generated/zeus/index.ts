/* eslint-disable */

import fetch, { Response } from "node-fetch";
import { WebSocket } from "ws";
import { AllTypesProps, Ops, ReturnTypes } from "./const";
export const HOST = "http://localhost:8080/v1/graphql";

export const HEADERS = {};
export const apiSubscription = (options: chainOptions) => (query: string) => {
  try {
    const queryString = options[0] + "?query=" + encodeURIComponent(query);
    const wsString = queryString.replace("http", "ws");
    const host = (options.length > 1 && options[1]?.websocket?.[0]) || wsString;
    const webSocketOptions = options[1]?.websocket || [host];
    const ws = new WebSocket(...webSocketOptions);
    return {
      ws,
      on: (e: (args: any) => void) => {
        ws.onmessage = (event: any) => {
          if (event.data) {
            const parsed = JSON.parse(event.data);
            const data = parsed.data;
            return e(data);
          }
        };
      },
      off: (e: (args: any) => void) => {
        ws.onclose = e;
      },
      error: (e: (args: any) => void) => {
        ws.onerror = e;
      },
      open: (e: () => void) => {
        ws.onopen = e;
      },
    };
  } catch {
    throw new Error("No websockets implemented");
  }
};
const handleFetchResponse = (response: Response): Promise<GraphQLResponse> => {
  if (!response.ok) {
    return new Promise((_, reject) => {
      response
        .text()
        .then((text) => {
          try {
            reject(JSON.parse(text));
          } catch (err) {
            reject(text);
          }
        })
        .catch(reject);
    });
  }
  return response.json() as Promise<GraphQLResponse>;
};

export const apiFetch =
  (options: fetchOptions) =>
  (query: string, variables: Record<string, unknown> = {}) => {
    const fetchOptions = options[1] || {};
    if (fetchOptions.method && fetchOptions.method === "GET") {
      return fetch(
        `${options[0]}?query=${encodeURIComponent(query)}`,
        fetchOptions
      )
        .then(handleFetchResponse)
        .then((response: GraphQLResponse) => {
          if (response.errors) {
            throw new GraphQLError(response);
          }
          return response.data;
        });
    }
    return fetch(`${options[0]}`, {
      body: JSON.stringify({ query, variables }),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      ...fetchOptions,
    })
      .then(handleFetchResponse)
      .then((response: GraphQLResponse) => {
        if (response.errors) {
          throw new GraphQLError(response);
        }
        return response.data;
      });
  };

export const InternalsBuildQuery = ({
  ops,
  props,
  returns,
  options,
  scalars,
}: {
  props: AllTypesPropsType;
  returns: ReturnTypesType;
  ops: Operations;
  options?: OperationOptions;
  scalars?: ScalarDefinition;
}) => {
  const ibb = (
    k: string,
    o: InputValueType | VType,
    p = "",
    root = true,
    vars: Array<{ name: string; graphQLType: string }> = []
  ): string => {
    const keyForPath = purifyGraphQLKey(k);
    const newPath = [p, keyForPath].join(SEPARATOR);
    if (!o) {
      return "";
    }
    if (typeof o === "boolean" || typeof o === "number") {
      return k;
    }
    if (typeof o === "string") {
      return `${k} ${o}`;
    }
    if (Array.isArray(o)) {
      const args = InternalArgsBuilt({
        props,
        returns,
        ops,
        scalars,
        vars,
      })(o[0], newPath);
      return `${ibb(args ? `${k}(${args})` : k, o[1], p, false, vars)}`;
    }
    if (k === "__alias") {
      return Object.entries(o)
        .map(([alias, objectUnderAlias]) => {
          if (
            typeof objectUnderAlias !== "object" ||
            Array.isArray(objectUnderAlias)
          ) {
            throw new Error(
              "Invalid alias it should be __alias:{ YOUR_ALIAS_NAME: { OPERATION_NAME: { ...selectors }}}"
            );
          }
          const operationName = Object.keys(objectUnderAlias)[0];
          const operation = objectUnderAlias[operationName];
          return ibb(`${alias}:${operationName}`, operation, p, false, vars);
        })
        .join("\n");
    }
    const hasOperationName =
      root && options?.operationName ? " " + options.operationName : "";
    const keyForDirectives = o.__directives ?? "";
    const query = `{${Object.entries(o)
      .filter(([k]) => k !== "__directives")
      .map((e) =>
        ibb(...e, [p, `field<>${keyForPath}`].join(SEPARATOR), false, vars)
      )
      .join("\n")}}`;
    if (!root) {
      return `${k} ${keyForDirectives}${hasOperationName} ${query}`;
    }
    const varsString = vars
      .map((v) => `${v.name}: ${v.graphQLType}`)
      .join(", ");
    return `${k} ${keyForDirectives}${hasOperationName}${varsString ? `(${varsString})` : ""} ${query}`;
  };
  return ibb;
};

export const Thunder =
  (fn: FetchFunction) =>
  <
    O extends keyof typeof Ops,
    SCLR extends ScalarDefinition,
    R extends keyof ValueTypes = GenericOperation<O>,
  >(
    operation: O,
    graphqlOptions?: ThunderGraphQLOptions<SCLR>
  ) =>
  <Z extends ValueTypes[R]>(
    o: (Z & ValueTypes[R]) | ValueTypes[R],
    ops?: OperationOptions & { variables?: Record<string, unknown> }
  ) =>
    fn(
      Zeus(operation, o, {
        operationOptions: ops,
        scalars: graphqlOptions?.scalars,
      }),
      ops?.variables
    ).then((data) => {
      if (graphqlOptions?.scalars) {
        return decodeScalarsInResponse({
          response: data,
          initialOp: operation,
          initialZeusQuery: o as VType,
          returns: ReturnTypes,
          scalars: graphqlOptions.scalars,
          ops: Ops,
        });
      }
      return data;
    }) as Promise<InputType<GraphQLTypes[R], Z, SCLR>>;

export const Chain = (...options: chainOptions) => Thunder(apiFetch(options));

export const SubscriptionThunder =
  (fn: SubscriptionFunction) =>
  <
    O extends keyof typeof Ops,
    SCLR extends ScalarDefinition,
    R extends keyof ValueTypes = GenericOperation<O>,
  >(
    operation: O,
    graphqlOptions?: ThunderGraphQLOptions<SCLR>
  ) =>
  <Z extends ValueTypes[R]>(
    o: (Z & ValueTypes[R]) | ValueTypes[R],
    ops?: OperationOptions & { variables?: ExtractVariables<Z> }
  ) => {
    const returnedFunction = fn(
      Zeus(operation, o, {
        operationOptions: ops,
        scalars: graphqlOptions?.scalars,
      })
    ) as SubscriptionToGraphQL<Z, GraphQLTypes[R], SCLR>;
    if (returnedFunction?.on && graphqlOptions?.scalars) {
      const wrapped = returnedFunction.on;
      returnedFunction.on = (
        fnToCall: (args: InputType<GraphQLTypes[R], Z, SCLR>) => void
      ) =>
        wrapped((data: InputType<GraphQLTypes[R], Z, SCLR>) => {
          if (graphqlOptions?.scalars) {
            return fnToCall(
              decodeScalarsInResponse({
                response: data,
                initialOp: operation,
                initialZeusQuery: o as VType,
                returns: ReturnTypes,
                scalars: graphqlOptions.scalars,
                ops: Ops,
              })
            );
          }
          return fnToCall(data);
        });
    }
    return returnedFunction;
  };

export const Subscription = (...options: chainOptions) =>
  SubscriptionThunder(apiSubscription(options));
export const Zeus = <
  Z extends ValueTypes[R],
  O extends keyof typeof Ops,
  R extends keyof ValueTypes = GenericOperation<O>,
>(
  operation: O,
  o: (Z & ValueTypes[R]) | ValueTypes[R],
  ops?: {
    operationOptions?: OperationOptions;
    scalars?: ScalarDefinition;
  }
) =>
  InternalsBuildQuery({
    props: AllTypesProps,
    returns: ReturnTypes,
    ops: Ops,
    options: ops?.operationOptions,
    scalars: ops?.scalars,
  })(operation, o as VType);

export const ZeusSelect = <T>() => ((t: unknown) => t) as SelectionFunction<T>;

export const Selector = <T extends keyof ValueTypes>(key: T) =>
  key && ZeusSelect<ValueTypes[T]>();

export const TypeFromSelector = <T extends keyof ValueTypes>(key: T) =>
  key && ZeusSelect<ValueTypes[T]>();
export const Gql = Chain(HOST, {
  headers: {
    "Content-Type": "application/json",
    ...HEADERS,
  },
});

export const ZeusScalars = ZeusSelect<ScalarCoders>();

export const decodeScalarsInResponse = <O extends Operations>({
  response,
  scalars,
  returns,
  ops,
  initialZeusQuery,
  initialOp,
}: {
  ops: O;
  response: any;
  returns: ReturnTypesType;
  scalars?: Record<string, ScalarResolver | undefined>;
  initialOp: keyof O;
  initialZeusQuery: InputValueType | VType;
}) => {
  if (!scalars) {
    return response;
  }
  const builder = PrepareScalarPaths({
    ops,
    returns,
  });

  const scalarPaths = builder(
    initialOp as string,
    ops[initialOp],
    initialZeusQuery
  );
  if (scalarPaths) {
    const r = traverseResponse({ scalarPaths, resolvers: scalars })(
      initialOp as string,
      response,
      [ops[initialOp]]
    );
    return r;
  }
  return response;
};

export const traverseResponse = ({
  resolvers,
  scalarPaths,
}: {
  scalarPaths: { [x: string]: `scalar.${string}` };
  resolvers: {
    [x: string]: ScalarResolver | undefined;
  };
}) => {
  const ibb = (
    k: string,
    o: InputValueType | VType,
    p: string[] = []
  ): unknown => {
    if (Array.isArray(o)) {
      return o.map((eachO) => ibb(k, eachO, p));
    }
    if (o == null) {
      return o;
    }
    const scalarPathString = p.join(SEPARATOR);
    const currentScalarString = scalarPaths[scalarPathString];
    if (currentScalarString) {
      const currentDecoder =
        resolvers[currentScalarString.split(".")[1]]?.decode;
      if (currentDecoder) {
        return currentDecoder(o);
      }
    }
    if (
      typeof o === "boolean" ||
      typeof o === "number" ||
      typeof o === "string" ||
      !o
    ) {
      return o;
    }
    const entries = Object.entries(o).map(
      ([k, v]) => [k, ibb(k, v, [...p, purifyGraphQLKey(k)])] as const
    );
    const objectFromEntries = entries.reduce<Record<string, unknown>>(
      (a, [k, v]) => {
        a[k] = v;
        return a;
      },
      {}
    );
    return objectFromEntries;
  };
  return ibb;
};

export type AllTypesPropsType = {
  [x: string]:
    | undefined
    | `scalar.${string}`
    | "enum"
    | {
        [x: string]:
          | undefined
          | string
          | {
              [x: string]: string | undefined;
            };
      };
};

export type ReturnTypesType = {
  [x: string]:
    | {
        [x: string]: string | undefined;
      }
    | `scalar.${string}`
    | undefined;
};
export type InputValueType = {
  [x: string]:
    | undefined
    | boolean
    | string
    | number
    | [any, undefined | boolean | InputValueType]
    | InputValueType;
};
export type VType =
  | undefined
  | boolean
  | string
  | number
  | [any, undefined | boolean | InputValueType]
  | InputValueType;

export type PlainType = boolean | number | string | null | undefined;
export type ZeusArgsType =
  | PlainType
  | {
      [x: string]: ZeusArgsType;
    }
  | Array<ZeusArgsType>;

export type Operations = Record<string, string>;

export type VariableDefinition = {
  [x: string]: unknown;
};

export const SEPARATOR = "|";

export type fetchOptions = Parameters<typeof fetch>;
type websocketOptions = typeof WebSocket extends new (
  ...args: infer R
) => WebSocket
  ? R
  : never;
export type chainOptions =
  | [fetchOptions[0], fetchOptions[1] & { websocket?: websocketOptions }]
  | [fetchOptions[0]];
export type FetchFunction = (
  query: string,
  variables?: Record<string, unknown>
) => Promise<any>;
export type SubscriptionFunction = (query: string) => any;
type NotUndefined<T> = T extends undefined ? never : T;
export type ResolverType<F> = NotUndefined<
  F extends [infer ARGS, any] ? ARGS : undefined
>;

export type OperationOptions = {
  operationName?: string;
};

export type ScalarCoder = Record<string, (s: unknown) => string>;

export interface GraphQLResponse {
  data?: Record<string, any>;
  errors?: Array<{
    message: string;
  }>;
}
export class GraphQLError extends Error {
  constructor(public response: GraphQLResponse) {
    super("");
    console.error(response);
  }
  toString() {
    return "GraphQL Response Error";
  }
}
export type GenericOperation<O> = O extends keyof typeof Ops
  ? (typeof Ops)[O]
  : never;
export type ThunderGraphQLOptions<SCLR extends ScalarDefinition> = {
  scalars?: SCLR | ScalarCoders;
};

const ExtractScalar = (
  mappedParts: string[],
  returns: ReturnTypesType
): `scalar.${string}` | undefined => {
  if (mappedParts.length === 0) {
    return;
  }
  const oKey = mappedParts[0];
  const returnP1 = returns[oKey];
  if (typeof returnP1 === "object") {
    const returnP2 = returnP1[mappedParts[1]];
    if (returnP2) {
      return ExtractScalar([returnP2, ...mappedParts.slice(2)], returns);
    }
    return undefined;
  }
  return returnP1 as `scalar.${string}` | undefined;
};

export const PrepareScalarPaths = ({
  ops,
  returns,
}: {
  returns: ReturnTypesType;
  ops: Operations;
}) => {
  const ibb = (
    k: string,
    originalKey: string,
    o: InputValueType | VType,
    p: string[] = [],
    pOriginals: string[] = [],
    root = true
  ): { [x: string]: `scalar.${string}` } | undefined => {
    if (!o) {
      return;
    }
    if (
      typeof o === "boolean" ||
      typeof o === "number" ||
      typeof o === "string"
    ) {
      const extractionArray = [...pOriginals, originalKey];
      const isScalar = ExtractScalar(extractionArray, returns);
      if (isScalar?.startsWith("scalar")) {
        const partOfTree = {
          [[...p, k].join(SEPARATOR)]: isScalar,
        };
        return partOfTree;
      }
      return {};
    }
    if (Array.isArray(o)) {
      return ibb(k, k, o[1], p, pOriginals, false);
    }
    if (k === "__alias") {
      return Object.entries(o)
        .map(([alias, objectUnderAlias]) => {
          if (
            typeof objectUnderAlias !== "object" ||
            Array.isArray(objectUnderAlias)
          ) {
            throw new Error(
              "Invalid alias it should be __alias:{ YOUR_ALIAS_NAME: { OPERATION_NAME: { ...selectors }}}"
            );
          }
          const operationName = Object.keys(objectUnderAlias)[0];
          const operation = objectUnderAlias[operationName];
          return ibb(alias, operationName, operation, p, pOriginals, false);
        })
        .reduce((a, b) => ({
          ...a,
          ...b,
        }));
    }
    const keyName = root ? ops[k] : k;
    return Object.entries(o)
      .filter(([k]) => k !== "__directives")
      .map(([k, v]) => {
        // Inline fragments shouldn't be added to the path as they aren't a field
        const isInlineFragment = originalKey.match(/^...\s*on/) != null;
        return ibb(
          k,
          k,
          v,
          isInlineFragment ? p : [...p, purifyGraphQLKey(keyName || k)],
          isInlineFragment
            ? pOriginals
            : [...pOriginals, purifyGraphQLKey(originalKey)],
          false
        );
      })
      .reduce((a, b) => ({
        ...a,
        ...b,
      }));
  };
  return ibb;
};

export const purifyGraphQLKey = (k: string) =>
  k.replace(/\([^)]*\)/g, "").replace(/^[^:]*\:/g, "");

const mapPart = (p: string) => {
  const [isArg, isField] = p.split("<>");
  if (isField) {
    return {
      v: isField,
      __type: "field",
    } as const;
  }
  return {
    v: isArg,
    __type: "arg",
  } as const;
};

type Part = ReturnType<typeof mapPart>;

export const ResolveFromPath = (
  props: AllTypesPropsType,
  returns: ReturnTypesType,
  ops: Operations
) => {
  const ResolvePropsType = (mappedParts: Part[]) => {
    const oKey = ops[mappedParts[0].v];
    const propsP1 = oKey ? props[oKey] : props[mappedParts[0].v];
    if (propsP1 === "enum" && mappedParts.length === 1) {
      return "enum";
    }
    if (
      typeof propsP1 === "string" &&
      propsP1.startsWith("scalar.") &&
      mappedParts.length === 1
    ) {
      return propsP1;
    }
    if (typeof propsP1 === "object") {
      if (mappedParts.length < 2) {
        return "not";
      }
      const propsP2 = propsP1[mappedParts[1].v];
      if (typeof propsP2 === "string") {
        return rpp(
          `${propsP2}${SEPARATOR}${mappedParts
            .slice(2)
            .map((mp) => mp.v)
            .join(SEPARATOR)}`
        );
      }
      if (typeof propsP2 === "object") {
        if (mappedParts.length < 3) {
          return "not";
        }
        const propsP3 = propsP2[mappedParts[2].v];
        if (propsP3 && mappedParts[2].__type === "arg") {
          return rpp(
            `${propsP3}${SEPARATOR}${mappedParts
              .slice(3)
              .map((mp) => mp.v)
              .join(SEPARATOR)}`
          );
        }
      }
    }
  };
  const ResolveReturnType = (mappedParts: Part[]) => {
    if (mappedParts.length === 0) {
      return "not";
    }
    const oKey = ops[mappedParts[0].v];
    const returnP1 = oKey ? returns[oKey] : returns[mappedParts[0].v];
    if (typeof returnP1 === "object") {
      if (mappedParts.length < 2) return "not";
      const returnP2 = returnP1[mappedParts[1].v];
      if (returnP2) {
        return rpp(
          `${returnP2}${SEPARATOR}${mappedParts
            .slice(2)
            .map((mp) => mp.v)
            .join(SEPARATOR)}`
        );
      }
    }
  };
  const rpp = (path: string): "enum" | "not" | `scalar.${string}` => {
    const parts = path.split(SEPARATOR).filter((l) => l.length > 0);
    const mappedParts = parts.map(mapPart);
    const propsP1 = ResolvePropsType(mappedParts);
    if (propsP1) {
      return propsP1;
    }
    const returnP1 = ResolveReturnType(mappedParts);
    if (returnP1) {
      return returnP1;
    }
    return "not";
  };
  return rpp;
};

export const InternalArgsBuilt = ({
  props,
  ops,
  returns,
  scalars,
  vars,
}: {
  props: AllTypesPropsType;
  returns: ReturnTypesType;
  ops: Operations;
  scalars?: ScalarDefinition;
  vars: Array<{ name: string; graphQLType: string }>;
}) => {
  const arb = (a: ZeusArgsType, p = "", root = true): string => {
    if (typeof a === "string") {
      if (a.startsWith(START_VAR_NAME)) {
        const [varName, graphQLType] = a
          .replace(START_VAR_NAME, "$")
          .split(GRAPHQL_TYPE_SEPARATOR);
        const v = vars.find((v) => v.name === varName);
        if (!v) {
          vars.push({
            name: varName,
            graphQLType,
          });
        } else {
          if (v.graphQLType !== graphQLType) {
            throw new Error(
              `Invalid variable exists with two different GraphQL Types, "${v.graphQLType}" and ${graphQLType}`
            );
          }
        }
        return varName;
      }
    }
    const checkType = ResolveFromPath(props, returns, ops)(p);
    if (checkType.startsWith("scalar.")) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, ...splittedScalar] = checkType.split(".");
      const scalarKey = splittedScalar.join(".");
      return (scalars?.[scalarKey]?.encode?.(a) as string) || JSON.stringify(a);
    }
    if (Array.isArray(a)) {
      return `[${a.map((arr) => arb(arr, p, false)).join(", ")}]`;
    }
    if (typeof a === "string") {
      if (checkType === "enum") {
        return a;
      }
      return `${JSON.stringify(a)}`;
    }
    if (typeof a === "object") {
      if (a === null) {
        return `null`;
      }
      const returnedObjectString = Object.entries(a)
        .filter(([, v]) => typeof v !== "undefined")
        .map(([k, v]) => `${k}: ${arb(v, [p, k].join(SEPARATOR), false)}`)
        .join(",\n");
      if (!root) {
        return `{${returnedObjectString}}`;
      }
      return returnedObjectString;
    }
    return `${a}`;
  };
  return arb;
};

export const resolverFor = <
  X,
  T extends keyof ResolverInputTypes,
  Z extends keyof ResolverInputTypes[T],
>(
  type: T,
  field: Z,
  fn: (
    args: Required<ResolverInputTypes[T]>[Z] extends [infer Input, any]
      ? Input
      : any,
    source: any
  ) => Z extends keyof ModelTypes[T]
    ? ModelTypes[T][Z] | Promise<ModelTypes[T][Z]> | X
    : never
) => fn as (args?: any, source?: any) => ReturnType<typeof fn>;

export type UnwrapPromise<T> = T extends Promise<infer R> ? R : T;
export type ZeusState<T extends (...args: any[]) => Promise<any>> = NonNullable<
  UnwrapPromise<ReturnType<T>>
>;
export type ZeusHook<
  T extends (
    ...args: any[]
  ) => Record<string, (...args: any[]) => Promise<any>>,
  N extends keyof ReturnType<T>,
> = ZeusState<ReturnType<T>[N]>;

export type WithTypeNameValue<T> = T & {
  __typename?: boolean;
  __directives?: string;
};
export type AliasType<T> = WithTypeNameValue<T> & {
  __alias?: Record<string, WithTypeNameValue<T>>;
};
type DeepAnify<T> = {
  [P in keyof T]?: any;
};
type IsPayLoad<T> = T extends [any, infer PayLoad] ? PayLoad : T;
export type ScalarDefinition = Record<string, ScalarResolver>;

type IsScalar<S, SCLR extends ScalarDefinition> = S extends "scalar" & {
  name: infer T;
}
  ? T extends keyof SCLR
    ? SCLR[T]["decode"] extends (s: unknown) => unknown
      ? ReturnType<SCLR[T]["decode"]>
      : unknown
    : unknown
  : S;
type IsArray<T, U, SCLR extends ScalarDefinition> =
  T extends Array<infer R> ? InputType<R, U, SCLR>[] : InputType<T, U, SCLR>;
type FlattenArray<T> = T extends Array<infer R> ? R : T;
type BaseZeusResolver = boolean | 1 | string | Variable<any, string>;

type IsInterfaced<
  SRC extends DeepAnify<DST>,
  DST,
  SCLR extends ScalarDefinition,
> =
  FlattenArray<SRC> extends ZEUS_INTERFACES | ZEUS_UNIONS
    ? {
        [P in keyof SRC]: SRC[P] extends "__union" & infer R
          ? P extends keyof DST
            ? IsArray<
                R,
                "__typename" extends keyof DST
                  ? DST[P] & { __typename: true }
                  : DST[P],
                SCLR
              >
            : IsArray<
                R,
                "__typename" extends keyof DST
                  ? { __typename: true }
                  : Record<string, never>,
                SCLR
              >
          : never;
      }[keyof SRC] & {
        [P in keyof Omit<
          Pick<
            SRC,
            {
              [P in keyof DST]: SRC[P] extends "__union" & infer R ? never : P;
            }[keyof DST]
          >,
          "__typename"
        >]: IsPayLoad<DST[P]> extends BaseZeusResolver
          ? IsScalar<SRC[P], SCLR>
          : IsArray<SRC[P], DST[P], SCLR>;
      }
    : {
        [P in keyof Pick<SRC, keyof DST>]: IsPayLoad<
          DST[P]
        > extends BaseZeusResolver
          ? IsScalar<SRC[P], SCLR>
          : IsArray<SRC[P], DST[P], SCLR>;
      };

export type MapType<SRC, DST, SCLR extends ScalarDefinition> =
  SRC extends DeepAnify<DST> ? IsInterfaced<SRC, DST, SCLR> : never;
// eslint-disable-next-line @typescript-eslint/ban-types
export type InputType<SRC, DST, SCLR extends ScalarDefinition = {}> =
  IsPayLoad<DST> extends { __alias: infer R }
    ? {
        [P in keyof R]: MapType<SRC, R[P], SCLR>[keyof MapType<
          SRC,
          R[P],
          SCLR
        >];
      } & MapType<SRC, Omit<IsPayLoad<DST>, "__alias">, SCLR>
    : MapType<SRC, IsPayLoad<DST>, SCLR>;
export type SubscriptionToGraphQL<Z, T, SCLR extends ScalarDefinition> = {
  ws: WebSocket;
  on: (fn: (args: InputType<T, Z, SCLR>) => void) => void;
  off: (
    fn: (e: {
      data?: InputType<T, Z, SCLR>;
      code?: number;
      reason?: string;
      message?: string;
    }) => void
  ) => void;
  error: (
    fn: (e: { data?: InputType<T, Z, SCLR>; errors?: string[] }) => void
  ) => void;
  open: () => void;
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type FromSelector<
  SELECTOR,
  NAME extends keyof GraphQLTypes,
  SCLR extends ScalarDefinition = {},
> = InputType<GraphQLTypes[NAME], SELECTOR, SCLR>;

export type ScalarResolver = {
  encode?: (s: unknown) => string;
  decode?: (s: unknown) => unknown;
};

export type SelectionFunction<V> = <T>(t: T | V) => T;

type BuiltInVariableTypes = {
  ["String"]: string;
  ["Int"]: number;
  ["Float"]: number;
  ["ID"]: unknown;
  ["Boolean"]: boolean;
};
type AllVariableTypes = keyof BuiltInVariableTypes | keyof ZEUS_VARIABLES;
type VariableRequired<T extends string> =
  | `${T}!`
  | T
  | `[${T}]`
  | `[${T}]!`
  | `[${T}!]`
  | `[${T}!]!`;
type VR<T extends string> = VariableRequired<VariableRequired<T>>;

export type GraphQLVariableType = VR<AllVariableTypes>;

type ExtractVariableTypeString<T extends string> =
  T extends VR<infer R1>
    ? R1 extends VR<infer R2>
      ? R2 extends VR<infer R3>
        ? R3 extends VR<infer R4>
          ? R4 extends VR<infer R5>
            ? R5
            : R4
          : R3
        : R2
      : R1
    : T;

type DecomposeType<T, Type> = T extends `[${infer R}]`
  ? Array<DecomposeType<R, Type>> | undefined
  : T extends `${infer R}!`
    ? NonNullable<DecomposeType<R, Type>>
    : Type | undefined;

type ExtractTypeFromGraphQLType<T extends string> =
  T extends keyof ZEUS_VARIABLES
    ? ZEUS_VARIABLES[T]
    : T extends keyof BuiltInVariableTypes
      ? BuiltInVariableTypes[T]
      : any;

export type GetVariableType<T extends string> = DecomposeType<
  T,
  ExtractTypeFromGraphQLType<ExtractVariableTypeString<T>>
>;

type UndefinedKeys<T> = {
  [K in keyof T]-?: T[K] extends NonNullable<T[K]> ? never : K;
}[keyof T];

type WithNullableKeys<T> = Pick<T, UndefinedKeys<T>>;
type WithNonNullableKeys<T> = Omit<T, UndefinedKeys<T>>;

type OptionalKeys<T> = {
  [P in keyof T]?: T[P];
};

export type WithOptionalNullables<T> = OptionalKeys<WithNullableKeys<T>> &
  WithNonNullableKeys<T>;

export type Variable<T extends GraphQLVariableType, Name extends string> = {
  " __zeus_name": Name;
  " __zeus_type": T;
};

export type ExtractVariablesDeep<Query> =
  Query extends Variable<infer VType, infer VName>
    ? { [key in VName]: GetVariableType<VType> }
    : Query extends string | number | boolean | Array<string | number | boolean>
      ? // eslint-disable-next-line @typescript-eslint/ban-types
        {}
      : UnionToIntersection<
          {
            [K in keyof Query]: WithOptionalNullables<
              ExtractVariablesDeep<Query[K]>
            >;
          }[keyof Query]
        >;

export type ExtractVariables<Query> =
  Query extends Variable<infer VType, infer VName>
    ? { [key in VName]: GetVariableType<VType> }
    : Query extends [infer Inputs, infer Outputs]
      ? ExtractVariablesDeep<Inputs> & ExtractVariables<Outputs>
      : Query extends
            | string
            | number
            | boolean
            | Array<string | number | boolean>
        ? // eslint-disable-next-line @typescript-eslint/ban-types
          {}
        : UnionToIntersection<
            {
              [K in keyof Query]: WithOptionalNullables<
                ExtractVariables<Query[K]>
              >;
            }[keyof Query]
          >;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

export const START_VAR_NAME = `$ZEUS_VAR`;
export const GRAPHQL_TYPE_SEPARATOR = `__$GRAPHQL__`;

export const $ = <Type extends GraphQLVariableType, Name extends string>(
  name: Name,
  graphqlType: Type
) => {
  return (START_VAR_NAME +
    name +
    GRAPHQL_TYPE_SEPARATOR +
    graphqlType) as unknown as Variable<Type, Name>;
};
type ZEUS_INTERFACES = never;
export type ScalarCoders = {
  uuid?: ScalarResolver;
};
type ZEUS_UNIONS = never;

export type ValueTypes = {
  /** OAuth 2.0 access code grants. */
  ["access_codes"]: AliasType<{
    access_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens"],
    ];
    access_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens_aggregate"],
    ];
    client?: boolean | `@${string}`;
    /** An object relationship */
    clients?: ValueTypes["clients"];
    code?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    refresh_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["refresh_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["refresh_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["refresh_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens"],
    ];
    refresh_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["refresh_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["refresh_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["refresh_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens_aggregate"],
    ];
    scope?: boolean | `@${string}`;
    used?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "access_codes" */
  ["access_codes_aggregate"]: AliasType<{
    aggregate?: ValueTypes["access_codes_aggregate_fields"];
    nodes?: ValueTypes["access_codes"];
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate fields of "access_codes" */
  ["access_codes_aggregate_fields"]: AliasType<{
    count?: [
      {
        columns?:
          | Array<ValueTypes["access_codes_select_column"]>
          | undefined
          | null
          | Variable<any, string>;
        distinct?: boolean | undefined | null | Variable<any, string>;
      },
      boolean | `@${string}`,
    ];
    max?: ValueTypes["access_codes_max_fields"];
    min?: ValueTypes["access_codes_min_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** Boolean expression to filter rows from the table "access_codes". All fields are combined with a logical 'AND'. */
  ["access_codes_bool_exp"]: {
    _and?:
      | Array<ValueTypes["access_codes_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    _not?:
      | ValueTypes["access_codes_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    _or?:
      | Array<ValueTypes["access_codes_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    access_tokens?:
      | ValueTypes["access_tokens_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    access_tokens_aggregate?:
      | ValueTypes["access_tokens_aggregate_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    client?:
      | ValueTypes["uuid_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    clients?:
      | ValueTypes["clients_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    code?:
      | ValueTypes["uuid_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    id?:
      | ValueTypes["uuid_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    refresh_tokens?:
      | ValueTypes["refresh_tokens_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    refresh_tokens_aggregate?:
      | ValueTypes["refresh_tokens_aggregate_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    scope?:
      | ValueTypes["String_array_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    used?:
      | ValueTypes["Boolean_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    user_id?:
      | ValueTypes["String_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** unique or primary key constraints on table "access_codes" */
  ["access_codes_constraint"]: access_codes_constraint;
  /** input type for inserting data into table "access_codes" */
  ["access_codes_insert_input"]: {
    access_tokens?:
      | ValueTypes["access_tokens_arr_rel_insert_input"]
      | undefined
      | null
      | Variable<any, string>;
    client?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    clients?:
      | ValueTypes["clients_obj_rel_insert_input"]
      | undefined
      | null
      | Variable<any, string>;
    code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    id?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    refresh_tokens?:
      | ValueTypes["refresh_tokens_arr_rel_insert_input"]
      | undefined
      | null
      | Variable<any, string>;
    scope?: Array<string> | undefined | null | Variable<any, string>;
    used?: boolean | undefined | null | Variable<any, string>;
    user_id?: string | undefined | null | Variable<any, string>;
  };
  /** aggregate max on columns */
  ["access_codes_max_fields"]: AliasType<{
    client?: boolean | `@${string}`;
    code?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    scope?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate min on columns */
  ["access_codes_min_fields"]: AliasType<{
    client?: boolean | `@${string}`;
    code?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    scope?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** response of any mutation on the table "access_codes" */
  ["access_codes_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ValueTypes["access_codes"];
    __typename?: boolean | `@${string}`;
  }>;
  /** input type for inserting object relation for remote table "access_codes" */
  ["access_codes_obj_rel_insert_input"]: {
    data: ValueTypes["access_codes_insert_input"] | Variable<any, string>;
    /** upsert condition */
    on_conflict?:
      | ValueTypes["access_codes_on_conflict"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** on_conflict condition type for table "access_codes" */
  ["access_codes_on_conflict"]: {
    constraint: ValueTypes["access_codes_constraint"] | Variable<any, string>;
    update_columns:
      | Array<ValueTypes["access_codes_update_column"]>
      | Variable<any, string>;
    where?:
      | ValueTypes["access_codes_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Ordering options when selecting data from "access_codes". */
  ["access_codes_order_by"]: {
    access_tokens_aggregate?:
      | ValueTypes["access_tokens_aggregate_order_by"]
      | undefined
      | null
      | Variable<any, string>;
    client?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    clients?:
      | ValueTypes["clients_order_by"]
      | undefined
      | null
      | Variable<any, string>;
    code?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    refresh_tokens_aggregate?:
      | ValueTypes["refresh_tokens_aggregate_order_by"]
      | undefined
      | null
      | Variable<any, string>;
    scope?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    used?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    user_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
  };
  /** primary key columns input for table: access_codes */
  ["access_codes_pk_columns_input"]: {
    id: ValueTypes["uuid"] | Variable<any, string>;
  };
  /** select columns of table "access_codes" */
  ["access_codes_select_column"]: access_codes_select_column;
  /** input type for updating data in table "access_codes" */
  ["access_codes_set_input"]: {
    client?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    id?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    scope?: Array<string> | undefined | null | Variable<any, string>;
    used?: boolean | undefined | null | Variable<any, string>;
    user_id?: string | undefined | null | Variable<any, string>;
  };
  /** Streaming cursor of the table "access_codes" */
  ["access_codes_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value:
      | ValueTypes["access_codes_stream_cursor_value_input"]
      | Variable<any, string>;
    /** cursor ordering */
    ordering?:
      | ValueTypes["cursor_ordering"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Initial value of the column from where the streaming should start */
  ["access_codes_stream_cursor_value_input"]: {
    client?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    id?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    scope?: Array<string> | undefined | null | Variable<any, string>;
    used?: boolean | undefined | null | Variable<any, string>;
    user_id?: string | undefined | null | Variable<any, string>;
  };
  /** update columns of table "access_codes" */
  ["access_codes_update_column"]: access_codes_update_column;
  ["access_codes_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?:
      | ValueTypes["access_codes_set_input"]
      | undefined
      | null
      | Variable<any, string>;
    /** filter the rows which have to be updated */
    where: ValueTypes["access_codes_bool_exp"] | Variable<any, string>;
  };
  /** Minted OAuth 2.0 access tokens. Used to track revocations in the event of an access code replay. */
  ["access_tokens"]: AliasType<{
    access_code?: boolean | `@${string}`;
    jti?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "access_tokens" */
  ["access_tokens_aggregate"]: AliasType<{
    aggregate?: ValueTypes["access_tokens_aggregate_fields"];
    nodes?: ValueTypes["access_tokens"];
    __typename?: boolean | `@${string}`;
  }>;
  ["access_tokens_aggregate_bool_exp"]: {
    count?:
      | ValueTypes["access_tokens_aggregate_bool_exp_count"]
      | undefined
      | null
      | Variable<any, string>;
  };
  ["access_tokens_aggregate_bool_exp_count"]: {
    arguments?:
      | Array<ValueTypes["access_tokens_select_column"]>
      | undefined
      | null
      | Variable<any, string>;
    distinct?: boolean | undefined | null | Variable<any, string>;
    filter?:
      | ValueTypes["access_tokens_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    predicate: ValueTypes["Int_comparison_exp"] | Variable<any, string>;
  };
  /** aggregate fields of "access_tokens" */
  ["access_tokens_aggregate_fields"]: AliasType<{
    count?: [
      {
        columns?:
          | Array<ValueTypes["access_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string>;
        distinct?: boolean | undefined | null | Variable<any, string>;
      },
      boolean | `@${string}`,
    ];
    max?: ValueTypes["access_tokens_max_fields"];
    min?: ValueTypes["access_tokens_min_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** order by aggregate values of table "access_tokens" */
  ["access_tokens_aggregate_order_by"]: {
    count?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    max?:
      | ValueTypes["access_tokens_max_order_by"]
      | undefined
      | null
      | Variable<any, string>;
    min?:
      | ValueTypes["access_tokens_min_order_by"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** input type for inserting array relation for remote table "access_tokens" */
  ["access_tokens_arr_rel_insert_input"]: {
    data:
      | Array<ValueTypes["access_tokens_insert_input"]>
      | Variable<any, string>;
    /** upsert condition */
    on_conflict?:
      | ValueTypes["access_tokens_on_conflict"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Boolean expression to filter rows from the table "access_tokens". All fields are combined with a logical 'AND'. */
  ["access_tokens_bool_exp"]: {
    _and?:
      | Array<ValueTypes["access_tokens_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    _not?:
      | ValueTypes["access_tokens_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    _or?:
      | Array<ValueTypes["access_tokens_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    access_code?:
      | ValueTypes["uuid_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    jti?:
      | ValueTypes["String_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** unique or primary key constraints on table "access_tokens" */
  ["access_tokens_constraint"]: access_tokens_constraint;
  /** input type for inserting data into table "access_tokens" */
  ["access_tokens_insert_input"]: {
    access_code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    jti?: string | undefined | null | Variable<any, string>;
  };
  /** aggregate max on columns */
  ["access_tokens_max_fields"]: AliasType<{
    access_code?: boolean | `@${string}`;
    jti?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** order by max() on columns of table "access_tokens" */
  ["access_tokens_max_order_by"]: {
    access_code?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
    jti?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
  };
  /** aggregate min on columns */
  ["access_tokens_min_fields"]: AliasType<{
    access_code?: boolean | `@${string}`;
    jti?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** order by min() on columns of table "access_tokens" */
  ["access_tokens_min_order_by"]: {
    access_code?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
    jti?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
  };
  /** response of any mutation on the table "access_tokens" */
  ["access_tokens_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ValueTypes["access_tokens"];
    __typename?: boolean | `@${string}`;
  }>;
  /** on_conflict condition type for table "access_tokens" */
  ["access_tokens_on_conflict"]: {
    constraint: ValueTypes["access_tokens_constraint"] | Variable<any, string>;
    update_columns:
      | Array<ValueTypes["access_tokens_update_column"]>
      | Variable<any, string>;
    where?:
      | ValueTypes["access_tokens_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Ordering options when selecting data from "access_tokens". */
  ["access_tokens_order_by"]: {
    access_code?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
    jti?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
  };
  /** primary key columns input for table: access_tokens */
  ["access_tokens_pk_columns_input"]: {
    jti: string | Variable<any, string>;
  };
  /** select columns of table "access_tokens" */
  ["access_tokens_select_column"]: access_tokens_select_column;
  /** input type for updating data in table "access_tokens" */
  ["access_tokens_set_input"]: {
    access_code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    jti?: string | undefined | null | Variable<any, string>;
  };
  /** Streaming cursor of the table "access_tokens" */
  ["access_tokens_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value:
      | ValueTypes["access_tokens_stream_cursor_value_input"]
      | Variable<any, string>;
    /** cursor ordering */
    ordering?:
      | ValueTypes["cursor_ordering"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Initial value of the column from where the streaming should start */
  ["access_tokens_stream_cursor_value_input"]: {
    access_code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    jti?: string | undefined | null | Variable<any, string>;
  };
  /** update columns of table "access_tokens" */
  ["access_tokens_update_column"]: access_tokens_update_column;
  ["access_tokens_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?:
      | ValueTypes["access_tokens_set_input"]
      | undefined
      | null
      | Variable<any, string>;
    /** filter the rows which have to be updated */
    where: ValueTypes["access_tokens_bool_exp"] | Variable<any, string>;
  };
  /** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
  ["Boolean_comparison_exp"]: {
    _eq?: boolean | undefined | null | Variable<any, string>;
    _gt?: boolean | undefined | null | Variable<any, string>;
    _gte?: boolean | undefined | null | Variable<any, string>;
    _in?: Array<boolean> | undefined | null | Variable<any, string>;
    _is_null?: boolean | undefined | null | Variable<any, string>;
    _lt?: boolean | undefined | null | Variable<any, string>;
    _lte?: boolean | undefined | null | Variable<any, string>;
    _neq?: boolean | undefined | null | Variable<any, string>;
    _nin?: Array<boolean> | undefined | null | Variable<any, string>;
  };
  /** Burger counts for users. */
  ["burgers"]: AliasType<{
    count?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "burgers" */
  ["burgers_aggregate"]: AliasType<{
    aggregate?: ValueTypes["burgers_aggregate_fields"];
    nodes?: ValueTypes["burgers"];
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate fields of "burgers" */
  ["burgers_aggregate_fields"]: AliasType<{
    avg?: ValueTypes["burgers_avg_fields"];
    count?: [
      {
        columns?:
          | Array<ValueTypes["burgers_select_column"]>
          | undefined
          | null
          | Variable<any, string>;
        distinct?: boolean | undefined | null | Variable<any, string>;
      },
      boolean | `@${string}`,
    ];
    max?: ValueTypes["burgers_max_fields"];
    min?: ValueTypes["burgers_min_fields"];
    stddev?: ValueTypes["burgers_stddev_fields"];
    stddev_pop?: ValueTypes["burgers_stddev_pop_fields"];
    stddev_samp?: ValueTypes["burgers_stddev_samp_fields"];
    sum?: ValueTypes["burgers_sum_fields"];
    var_pop?: ValueTypes["burgers_var_pop_fields"];
    var_samp?: ValueTypes["burgers_var_samp_fields"];
    variance?: ValueTypes["burgers_variance_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate avg on columns */
  ["burgers_avg_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** Boolean expression to filter rows from the table "burgers". All fields are combined with a logical 'AND'. */
  ["burgers_bool_exp"]: {
    _and?:
      | Array<ValueTypes["burgers_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    _not?:
      | ValueTypes["burgers_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    _or?:
      | Array<ValueTypes["burgers_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    count?:
      | ValueTypes["Int_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    user_id?:
      | ValueTypes["String_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** unique or primary key constraints on table "burgers" */
  ["burgers_constraint"]: burgers_constraint;
  /** input type for incrementing numeric columns in table "burgers" */
  ["burgers_inc_input"]: {
    count?: number | undefined | null | Variable<any, string>;
  };
  /** input type for inserting data into table "burgers" */
  ["burgers_insert_input"]: {
    count?: number | undefined | null | Variable<any, string>;
    user_id?: string | undefined | null | Variable<any, string>;
  };
  /** aggregate max on columns */
  ["burgers_max_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate min on columns */
  ["burgers_min_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** response of any mutation on the table "burgers" */
  ["burgers_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ValueTypes["burgers"];
    __typename?: boolean | `@${string}`;
  }>;
  /** on_conflict condition type for table "burgers" */
  ["burgers_on_conflict"]: {
    constraint: ValueTypes["burgers_constraint"] | Variable<any, string>;
    update_columns:
      | Array<ValueTypes["burgers_update_column"]>
      | Variable<any, string>;
    where?:
      | ValueTypes["burgers_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Ordering options when selecting data from "burgers". */
  ["burgers_order_by"]: {
    count?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    user_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
  };
  /** primary key columns input for table: burgers */
  ["burgers_pk_columns_input"]: {
    user_id: string | Variable<any, string>;
  };
  /** select columns of table "burgers" */
  ["burgers_select_column"]: burgers_select_column;
  /** input type for updating data in table "burgers" */
  ["burgers_set_input"]: {
    count?: number | undefined | null | Variable<any, string>;
    user_id?: string | undefined | null | Variable<any, string>;
  };
  /** aggregate stddev on columns */
  ["burgers_stddev_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate stddev_pop on columns */
  ["burgers_stddev_pop_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate stddev_samp on columns */
  ["burgers_stddev_samp_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** Streaming cursor of the table "burgers" */
  ["burgers_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value:
      | ValueTypes["burgers_stream_cursor_value_input"]
      | Variable<any, string>;
    /** cursor ordering */
    ordering?:
      | ValueTypes["cursor_ordering"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Initial value of the column from where the streaming should start */
  ["burgers_stream_cursor_value_input"]: {
    count?: number | undefined | null | Variable<any, string>;
    user_id?: string | undefined | null | Variable<any, string>;
  };
  /** aggregate sum on columns */
  ["burgers_sum_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** update columns of table "burgers" */
  ["burgers_update_column"]: burgers_update_column;
  ["burgers_updates"]: {
    /** increments the numeric columns with given value of the filtered values */
    _inc?:
      | ValueTypes["burgers_inc_input"]
      | undefined
      | null
      | Variable<any, string>;
    /** sets the columns of the filtered rows to the given values */
    _set?:
      | ValueTypes["burgers_set_input"]
      | undefined
      | null
      | Variable<any, string>;
    /** filter the rows which have to be updated */
    where: ValueTypes["burgers_bool_exp"] | Variable<any, string>;
  };
  /** aggregate var_pop on columns */
  ["burgers_var_pop_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate var_samp on columns */
  ["burgers_var_samp_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate variance on columns */
  ["burgers_variance_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** Registered OAuth 2.0 clients. */
  ["clients"]: AliasType<{
    client_id?: boolean | `@${string}`;
    client_secret_hash?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    name?: boolean | `@${string}`;
    redirect_uri?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "clients" */
  ["clients_aggregate"]: AliasType<{
    aggregate?: ValueTypes["clients_aggregate_fields"];
    nodes?: ValueTypes["clients"];
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate fields of "clients" */
  ["clients_aggregate_fields"]: AliasType<{
    count?: [
      {
        columns?:
          | Array<ValueTypes["clients_select_column"]>
          | undefined
          | null
          | Variable<any, string>;
        distinct?: boolean | undefined | null | Variable<any, string>;
      },
      boolean | `@${string}`,
    ];
    max?: ValueTypes["clients_max_fields"];
    min?: ValueTypes["clients_min_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** Boolean expression to filter rows from the table "clients". All fields are combined with a logical 'AND'. */
  ["clients_bool_exp"]: {
    _and?:
      | Array<ValueTypes["clients_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    _not?:
      | ValueTypes["clients_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    _or?:
      | Array<ValueTypes["clients_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    client_id?:
      | ValueTypes["String_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    client_secret_hash?:
      | ValueTypes["String_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    id?:
      | ValueTypes["uuid_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    name?:
      | ValueTypes["String_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    redirect_uri?:
      | ValueTypes["String_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** unique or primary key constraints on table "clients" */
  ["clients_constraint"]: clients_constraint;
  /** input type for inserting data into table "clients" */
  ["clients_insert_input"]: {
    client_id?: string | undefined | null | Variable<any, string>;
    client_secret_hash?: string | undefined | null | Variable<any, string>;
    id?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    name?: string | undefined | null | Variable<any, string>;
    redirect_uri?: string | undefined | null | Variable<any, string>;
  };
  /** aggregate max on columns */
  ["clients_max_fields"]: AliasType<{
    client_id?: boolean | `@${string}`;
    client_secret_hash?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    name?: boolean | `@${string}`;
    redirect_uri?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate min on columns */
  ["clients_min_fields"]: AliasType<{
    client_id?: boolean | `@${string}`;
    client_secret_hash?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    name?: boolean | `@${string}`;
    redirect_uri?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** response of any mutation on the table "clients" */
  ["clients_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ValueTypes["clients"];
    __typename?: boolean | `@${string}`;
  }>;
  /** input type for inserting object relation for remote table "clients" */
  ["clients_obj_rel_insert_input"]: {
    data: ValueTypes["clients_insert_input"] | Variable<any, string>;
    /** upsert condition */
    on_conflict?:
      | ValueTypes["clients_on_conflict"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** on_conflict condition type for table "clients" */
  ["clients_on_conflict"]: {
    constraint: ValueTypes["clients_constraint"] | Variable<any, string>;
    update_columns:
      | Array<ValueTypes["clients_update_column"]>
      | Variable<any, string>;
    where?:
      | ValueTypes["clients_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Ordering options when selecting data from "clients". */
  ["clients_order_by"]: {
    client_id?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
    client_secret_hash?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
    id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    redirect_uri?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** primary key columns input for table: clients */
  ["clients_pk_columns_input"]: {
    id: ValueTypes["uuid"] | Variable<any, string>;
  };
  /** select columns of table "clients" */
  ["clients_select_column"]: clients_select_column;
  /** input type for updating data in table "clients" */
  ["clients_set_input"]: {
    client_id?: string | undefined | null | Variable<any, string>;
    client_secret_hash?: string | undefined | null | Variable<any, string>;
    id?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    name?: string | undefined | null | Variable<any, string>;
    redirect_uri?: string | undefined | null | Variable<any, string>;
  };
  /** Streaming cursor of the table "clients" */
  ["clients_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value:
      | ValueTypes["clients_stream_cursor_value_input"]
      | Variable<any, string>;
    /** cursor ordering */
    ordering?:
      | ValueTypes["cursor_ordering"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Initial value of the column from where the streaming should start */
  ["clients_stream_cursor_value_input"]: {
    client_id?: string | undefined | null | Variable<any, string>;
    client_secret_hash?: string | undefined | null | Variable<any, string>;
    id?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    name?: string | undefined | null | Variable<any, string>;
    redirect_uri?: string | undefined | null | Variable<any, string>;
  };
  /** update columns of table "clients" */
  ["clients_update_column"]: clients_update_column;
  ["clients_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?:
      | ValueTypes["clients_set_input"]
      | undefined
      | null
      | Variable<any, string>;
    /** filter the rows which have to be updated */
    where: ValueTypes["clients_bool_exp"] | Variable<any, string>;
  };
  /** ordering argument of a cursor */
  ["cursor_ordering"]: cursor_ordering;
  /** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
  ["Int_comparison_exp"]: {
    _eq?: number | undefined | null | Variable<any, string>;
    _gt?: number | undefined | null | Variable<any, string>;
    _gte?: number | undefined | null | Variable<any, string>;
    _in?: Array<number> | undefined | null | Variable<any, string>;
    _is_null?: boolean | undefined | null | Variable<any, string>;
    _lt?: number | undefined | null | Variable<any, string>;
    _lte?: number | undefined | null | Variable<any, string>;
    _neq?: number | undefined | null | Variable<any, string>;
    _nin?: Array<number> | undefined | null | Variable<any, string>;
  };
  /** mutation root */
  ["mutation_root"]: AliasType<{
    delete_access_codes?: [
      {
        /** filter the rows which have to be deleted */
        where: ValueTypes["access_codes_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["access_codes_mutation_response"],
    ];
    delete_access_codes_by_pk?: [
      { id: ValueTypes["uuid"] | Variable<any, string> },
      ValueTypes["access_codes"],
    ];
    delete_access_tokens?: [
      {
        /** filter the rows which have to be deleted */
        where: ValueTypes["access_tokens_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["access_tokens_mutation_response"],
    ];
    delete_access_tokens_by_pk?: [
      { jti: string | Variable<any, string> },
      ValueTypes["access_tokens"],
    ];
    delete_burgers?: [
      {
        /** filter the rows which have to be deleted */
        where: ValueTypes["burgers_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["burgers_mutation_response"],
    ];
    delete_burgers_by_pk?: [
      { user_id: string | Variable<any, string> },
      ValueTypes["burgers"],
    ];
    delete_clients?: [
      {
        /** filter the rows which have to be deleted */
        where: ValueTypes["clients_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["clients_mutation_response"],
    ];
    delete_clients_by_pk?: [
      { id: ValueTypes["uuid"] | Variable<any, string> },
      ValueTypes["clients"],
    ];
    delete_refresh_tokens?: [
      {
        /** filter the rows which have to be deleted */
        where: ValueTypes["refresh_tokens_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["refresh_tokens_mutation_response"],
    ];
    delete_refresh_tokens_by_pk?: [
      { token_hash: string | Variable<any, string> },
      ValueTypes["refresh_tokens"],
    ];
    insert_access_codes?: [
      {
        /** the rows to be inserted */
        objects:
          | Array<ValueTypes["access_codes_insert_input"]>
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["access_codes_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_codes_mutation_response"],
    ];
    insert_access_codes_one?: [
      {
        /** the row to be inserted */
        object:
          | ValueTypes["access_codes_insert_input"]
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["access_codes_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_codes"],
    ];
    insert_access_tokens?: [
      {
        /** the rows to be inserted */
        objects:
          | Array<ValueTypes["access_tokens_insert_input"]>
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["access_tokens_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens_mutation_response"],
    ];
    insert_access_tokens_one?: [
      {
        /** the row to be inserted */
        object:
          | ValueTypes["access_tokens_insert_input"]
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["access_tokens_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens"],
    ];
    insert_burgers?: [
      {
        /** the rows to be inserted */
        objects:
          | Array<ValueTypes["burgers_insert_input"]>
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["burgers_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["burgers_mutation_response"],
    ];
    insert_burgers_one?: [
      {
        /** the row to be inserted */
        object:
          | ValueTypes["burgers_insert_input"]
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["burgers_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["burgers"],
    ];
    insert_clients?: [
      {
        /** the rows to be inserted */
        objects:
          | Array<ValueTypes["clients_insert_input"]>
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["clients_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["clients_mutation_response"],
    ];
    insert_clients_one?: [
      {
        /** the row to be inserted */
        object:
          | ValueTypes["clients_insert_input"]
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["clients_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["clients"],
    ];
    insert_refresh_tokens?: [
      {
        /** the rows to be inserted */
        objects:
          | Array<ValueTypes["refresh_tokens_insert_input"]>
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["refresh_tokens_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens_mutation_response"],
    ];
    insert_refresh_tokens_one?: [
      {
        /** the row to be inserted */
        object:
          | ValueTypes["refresh_tokens_insert_input"]
          | Variable<any, string> /** upsert condition */;
        on_conflict?:
          | ValueTypes["refresh_tokens_on_conflict"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens"],
    ];
    update_access_codes?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ValueTypes["access_codes_set_input"]
          | undefined
          | null
          | Variable<
              any,
              string
            > /** filter the rows which have to be updated */;
        where: ValueTypes["access_codes_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["access_codes_mutation_response"],
    ];
    update_access_codes_by_pk?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ValueTypes["access_codes_set_input"]
          | undefined
          | null
          | Variable<any, string>;
        pk_columns:
          | ValueTypes["access_codes_pk_columns_input"]
          | Variable<any, string>;
      },
      ValueTypes["access_codes"],
    ];
    update_access_codes_many?: [
      {
        /** updates to execute, in order */
        updates:
          | Array<ValueTypes["access_codes_updates"]>
          | Variable<any, string>;
      },
      ValueTypes["access_codes_mutation_response"],
    ];
    update_access_tokens?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ValueTypes["access_tokens_set_input"]
          | undefined
          | null
          | Variable<
              any,
              string
            > /** filter the rows which have to be updated */;
        where: ValueTypes["access_tokens_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["access_tokens_mutation_response"],
    ];
    update_access_tokens_by_pk?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ValueTypes["access_tokens_set_input"]
          | undefined
          | null
          | Variable<any, string>;
        pk_columns:
          | ValueTypes["access_tokens_pk_columns_input"]
          | Variable<any, string>;
      },
      ValueTypes["access_tokens"],
    ];
    update_access_tokens_many?: [
      {
        /** updates to execute, in order */
        updates:
          | Array<ValueTypes["access_tokens_updates"]>
          | Variable<any, string>;
      },
      ValueTypes["access_tokens_mutation_response"],
    ];
    update_burgers?: [
      {
        /** increments the numeric columns with given value of the filtered values */
        _inc?:
          | ValueTypes["burgers_inc_input"]
          | undefined
          | null
          | Variable<
              any,
              string
            > /** sets the columns of the filtered rows to the given values */;
        _set?:
          | ValueTypes["burgers_set_input"]
          | undefined
          | null
          | Variable<
              any,
              string
            > /** filter the rows which have to be updated */;
        where: ValueTypes["burgers_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["burgers_mutation_response"],
    ];
    update_burgers_by_pk?: [
      {
        /** increments the numeric columns with given value of the filtered values */
        _inc?:
          | ValueTypes["burgers_inc_input"]
          | undefined
          | null
          | Variable<
              any,
              string
            > /** sets the columns of the filtered rows to the given values */;
        _set?:
          | ValueTypes["burgers_set_input"]
          | undefined
          | null
          | Variable<any, string>;
        pk_columns:
          | ValueTypes["burgers_pk_columns_input"]
          | Variable<any, string>;
      },
      ValueTypes["burgers"],
    ];
    update_burgers_many?: [
      {
        /** updates to execute, in order */
        updates: Array<ValueTypes["burgers_updates"]> | Variable<any, string>;
      },
      ValueTypes["burgers_mutation_response"],
    ];
    update_clients?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ValueTypes["clients_set_input"]
          | undefined
          | null
          | Variable<
              any,
              string
            > /** filter the rows which have to be updated */;
        where: ValueTypes["clients_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["clients_mutation_response"],
    ];
    update_clients_by_pk?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ValueTypes["clients_set_input"]
          | undefined
          | null
          | Variable<any, string>;
        pk_columns:
          | ValueTypes["clients_pk_columns_input"]
          | Variable<any, string>;
      },
      ValueTypes["clients"],
    ];
    update_clients_many?: [
      {
        /** updates to execute, in order */
        updates: Array<ValueTypes["clients_updates"]> | Variable<any, string>;
      },
      ValueTypes["clients_mutation_response"],
    ];
    update_refresh_tokens?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ValueTypes["refresh_tokens_set_input"]
          | undefined
          | null
          | Variable<
              any,
              string
            > /** filter the rows which have to be updated */;
        where: ValueTypes["refresh_tokens_bool_exp"] | Variable<any, string>;
      },
      ValueTypes["refresh_tokens_mutation_response"],
    ];
    update_refresh_tokens_by_pk?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ValueTypes["refresh_tokens_set_input"]
          | undefined
          | null
          | Variable<any, string>;
        pk_columns:
          | ValueTypes["refresh_tokens_pk_columns_input"]
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens"],
    ];
    update_refresh_tokens_many?: [
      {
        /** updates to execute, in order */
        updates:
          | Array<ValueTypes["refresh_tokens_updates"]>
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens_mutation_response"],
    ];
    __typename?: boolean | `@${string}`;
  }>;
  /** column ordering options */
  ["order_by"]: order_by;
  ["query_root"]: AliasType<{
    access_codes?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_codes_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_codes_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_codes_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_codes"],
    ];
    access_codes_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_codes_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_codes_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_codes_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_codes_aggregate"],
    ];
    access_codes_by_pk?: [
      { id: ValueTypes["uuid"] | Variable<any, string> },
      ValueTypes["access_codes"],
    ];
    access_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens"],
    ];
    access_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens_aggregate"],
    ];
    access_tokens_by_pk?: [
      { jti: string | Variable<any, string> },
      ValueTypes["access_tokens"],
    ];
    burgers?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["burgers_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["burgers_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["burgers_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["burgers"],
    ];
    burgers_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["burgers_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["burgers_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["burgers_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["burgers_aggregate"],
    ];
    burgers_by_pk?: [
      { user_id: string | Variable<any, string> },
      ValueTypes["burgers"],
    ];
    clients?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["clients_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["clients_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["clients_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["clients"],
    ];
    clients_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["clients_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["clients_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["clients_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["clients_aggregate"],
    ];
    clients_by_pk?: [
      { id: ValueTypes["uuid"] | Variable<any, string> },
      ValueTypes["clients"],
    ];
    refresh_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["refresh_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["refresh_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["refresh_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens"],
    ];
    refresh_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["refresh_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["refresh_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["refresh_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens_aggregate"],
    ];
    refresh_tokens_by_pk?: [
      { token_hash: string | Variable<any, string> },
      ValueTypes["refresh_tokens"],
    ];
    __typename?: boolean | `@${string}`;
  }>;
  /** OAuth 2.0 refresh tokens associated with auth codes. */
  ["refresh_tokens"]: AliasType<{
    /** An object relationship */
    access_code?: ValueTypes["access_codes"];
    auth_code?: boolean | `@${string}`;
    token_hash?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "refresh_tokens" */
  ["refresh_tokens_aggregate"]: AliasType<{
    aggregate?: ValueTypes["refresh_tokens_aggregate_fields"];
    nodes?: ValueTypes["refresh_tokens"];
    __typename?: boolean | `@${string}`;
  }>;
  ["refresh_tokens_aggregate_bool_exp"]: {
    count?:
      | ValueTypes["refresh_tokens_aggregate_bool_exp_count"]
      | undefined
      | null
      | Variable<any, string>;
  };
  ["refresh_tokens_aggregate_bool_exp_count"]: {
    arguments?:
      | Array<ValueTypes["refresh_tokens_select_column"]>
      | undefined
      | null
      | Variable<any, string>;
    distinct?: boolean | undefined | null | Variable<any, string>;
    filter?:
      | ValueTypes["refresh_tokens_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    predicate: ValueTypes["Int_comparison_exp"] | Variable<any, string>;
  };
  /** aggregate fields of "refresh_tokens" */
  ["refresh_tokens_aggregate_fields"]: AliasType<{
    count?: [
      {
        columns?:
          | Array<ValueTypes["refresh_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string>;
        distinct?: boolean | undefined | null | Variable<any, string>;
      },
      boolean | `@${string}`,
    ];
    max?: ValueTypes["refresh_tokens_max_fields"];
    min?: ValueTypes["refresh_tokens_min_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** order by aggregate values of table "refresh_tokens" */
  ["refresh_tokens_aggregate_order_by"]: {
    count?: ValueTypes["order_by"] | undefined | null | Variable<any, string>;
    max?:
      | ValueTypes["refresh_tokens_max_order_by"]
      | undefined
      | null
      | Variable<any, string>;
    min?:
      | ValueTypes["refresh_tokens_min_order_by"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** input type for inserting array relation for remote table "refresh_tokens" */
  ["refresh_tokens_arr_rel_insert_input"]: {
    data:
      | Array<ValueTypes["refresh_tokens_insert_input"]>
      | Variable<any, string>;
    /** upsert condition */
    on_conflict?:
      | ValueTypes["refresh_tokens_on_conflict"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Boolean expression to filter rows from the table "refresh_tokens". All fields are combined with a logical 'AND'. */
  ["refresh_tokens_bool_exp"]: {
    _and?:
      | Array<ValueTypes["refresh_tokens_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    _not?:
      | ValueTypes["refresh_tokens_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    _or?:
      | Array<ValueTypes["refresh_tokens_bool_exp"]>
      | undefined
      | null
      | Variable<any, string>;
    access_code?:
      | ValueTypes["access_codes_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
    auth_code?:
      | ValueTypes["uuid_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
    token_hash?:
      | ValueTypes["String_comparison_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** unique or primary key constraints on table "refresh_tokens" */
  ["refresh_tokens_constraint"]: refresh_tokens_constraint;
  /** input type for inserting data into table "refresh_tokens" */
  ["refresh_tokens_insert_input"]: {
    access_code?:
      | ValueTypes["access_codes_obj_rel_insert_input"]
      | undefined
      | null
      | Variable<any, string>;
    auth_code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    token_hash?: string | undefined | null | Variable<any, string>;
  };
  /** aggregate max on columns */
  ["refresh_tokens_max_fields"]: AliasType<{
    auth_code?: boolean | `@${string}`;
    token_hash?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** order by max() on columns of table "refresh_tokens" */
  ["refresh_tokens_max_order_by"]: {
    auth_code?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
    token_hash?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** aggregate min on columns */
  ["refresh_tokens_min_fields"]: AliasType<{
    auth_code?: boolean | `@${string}`;
    token_hash?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** order by min() on columns of table "refresh_tokens" */
  ["refresh_tokens_min_order_by"]: {
    auth_code?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
    token_hash?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** response of any mutation on the table "refresh_tokens" */
  ["refresh_tokens_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ValueTypes["refresh_tokens"];
    __typename?: boolean | `@${string}`;
  }>;
  /** on_conflict condition type for table "refresh_tokens" */
  ["refresh_tokens_on_conflict"]: {
    constraint: ValueTypes["refresh_tokens_constraint"] | Variable<any, string>;
    update_columns:
      | Array<ValueTypes["refresh_tokens_update_column"]>
      | Variable<any, string>;
    where?:
      | ValueTypes["refresh_tokens_bool_exp"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Ordering options when selecting data from "refresh_tokens". */
  ["refresh_tokens_order_by"]: {
    access_code?:
      | ValueTypes["access_codes_order_by"]
      | undefined
      | null
      | Variable<any, string>;
    auth_code?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
    token_hash?:
      | ValueTypes["order_by"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** primary key columns input for table: refresh_tokens */
  ["refresh_tokens_pk_columns_input"]: {
    token_hash: string | Variable<any, string>;
  };
  /** select columns of table "refresh_tokens" */
  ["refresh_tokens_select_column"]: refresh_tokens_select_column;
  /** input type for updating data in table "refresh_tokens" */
  ["refresh_tokens_set_input"]: {
    auth_code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    token_hash?: string | undefined | null | Variable<any, string>;
  };
  /** Streaming cursor of the table "refresh_tokens" */
  ["refresh_tokens_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value:
      | ValueTypes["refresh_tokens_stream_cursor_value_input"]
      | Variable<any, string>;
    /** cursor ordering */
    ordering?:
      | ValueTypes["cursor_ordering"]
      | undefined
      | null
      | Variable<any, string>;
  };
  /** Initial value of the column from where the streaming should start */
  ["refresh_tokens_stream_cursor_value_input"]: {
    auth_code?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    token_hash?: string | undefined | null | Variable<any, string>;
  };
  /** update columns of table "refresh_tokens" */
  ["refresh_tokens_update_column"]: refresh_tokens_update_column;
  ["refresh_tokens_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?:
      | ValueTypes["refresh_tokens_set_input"]
      | undefined
      | null
      | Variable<any, string>;
    /** filter the rows which have to be updated */
    where: ValueTypes["refresh_tokens_bool_exp"] | Variable<any, string>;
  };
  /** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
  ["String_array_comparison_exp"]: {
    /** is the array contained in the given array value */
    _contained_in?: Array<string> | undefined | null | Variable<any, string>;
    /** does the array contain the given value */
    _contains?: Array<string> | undefined | null | Variable<any, string>;
    _eq?: Array<string> | undefined | null | Variable<any, string>;
    _gt?: Array<string> | undefined | null | Variable<any, string>;
    _gte?: Array<string> | undefined | null | Variable<any, string>;
    _in?: Array<Array<string> | undefined | null> | Variable<any, string>;
    _is_null?: boolean | undefined | null | Variable<any, string>;
    _lt?: Array<string> | undefined | null | Variable<any, string>;
    _lte?: Array<string> | undefined | null | Variable<any, string>;
    _neq?: Array<string> | undefined | null | Variable<any, string>;
    _nin?: Array<Array<string> | undefined | null> | Variable<any, string>;
  };
  /** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
  ["String_comparison_exp"]: {
    _eq?: string | undefined | null | Variable<any, string>;
    _gt?: string | undefined | null | Variable<any, string>;
    _gte?: string | undefined | null | Variable<any, string>;
    /** does the column match the given case-insensitive pattern */
    _ilike?: string | undefined | null | Variable<any, string>;
    _in?: Array<string> | undefined | null | Variable<any, string>;
    /** does the column match the given POSIX regular expression, case insensitive */
    _iregex?: string | undefined | null | Variable<any, string>;
    _is_null?: boolean | undefined | null | Variable<any, string>;
    /** does the column match the given pattern */
    _like?: string | undefined | null | Variable<any, string>;
    _lt?: string | undefined | null | Variable<any, string>;
    _lte?: string | undefined | null | Variable<any, string>;
    _neq?: string | undefined | null | Variable<any, string>;
    /** does the column NOT match the given case-insensitive pattern */
    _nilike?: string | undefined | null | Variable<any, string>;
    _nin?: Array<string> | undefined | null | Variable<any, string>;
    /** does the column NOT match the given POSIX regular expression, case insensitive */
    _niregex?: string | undefined | null | Variable<any, string>;
    /** does the column NOT match the given pattern */
    _nlike?: string | undefined | null | Variable<any, string>;
    /** does the column NOT match the given POSIX regular expression, case sensitive */
    _nregex?: string | undefined | null | Variable<any, string>;
    /** does the column NOT match the given SQL regular expression */
    _nsimilar?: string | undefined | null | Variable<any, string>;
    /** does the column match the given POSIX regular expression, case sensitive */
    _regex?: string | undefined | null | Variable<any, string>;
    /** does the column match the given SQL regular expression */
    _similar?: string | undefined | null | Variable<any, string>;
  };
  ["subscription_root"]: AliasType<{
    access_codes?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_codes_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_codes_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_codes_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_codes"],
    ];
    access_codes_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_codes_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_codes_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_codes_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_codes_aggregate"],
    ];
    access_codes_by_pk?: [
      { id: ValueTypes["uuid"] | Variable<any, string> },
      ValueTypes["access_codes"],
    ];
    access_codes_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size:
          | number
          | Variable<
              any,
              string
            > /** cursor to stream the results returned by the query */;
        cursor:
          | Array<
              ValueTypes["access_codes_stream_cursor_input"] | undefined | null
            >
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_codes_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_codes"],
    ];
    access_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens"],
    ];
    access_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["access_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["access_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens_aggregate"],
    ];
    access_tokens_by_pk?: [
      { jti: string | Variable<any, string> },
      ValueTypes["access_tokens"],
    ];
    access_tokens_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size:
          | number
          | Variable<
              any,
              string
            > /** cursor to stream the results returned by the query */;
        cursor:
          | Array<
              ValueTypes["access_tokens_stream_cursor_input"] | undefined | null
            >
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["access_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["access_tokens"],
    ];
    burgers?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["burgers_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["burgers_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["burgers_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["burgers"],
    ];
    burgers_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["burgers_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["burgers_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["burgers_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["burgers_aggregate"],
    ];
    burgers_by_pk?: [
      { user_id: string | Variable<any, string> },
      ValueTypes["burgers"],
    ];
    burgers_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size:
          | number
          | Variable<
              any,
              string
            > /** cursor to stream the results returned by the query */;
        cursor:
          | Array<ValueTypes["burgers_stream_cursor_input"] | undefined | null>
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["burgers_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["burgers"],
    ];
    clients?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["clients_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["clients_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["clients_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["clients"],
    ];
    clients_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["clients_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["clients_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["clients_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["clients_aggregate"],
    ];
    clients_by_pk?: [
      { id: ValueTypes["uuid"] | Variable<any, string> },
      ValueTypes["clients"],
    ];
    clients_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size:
          | number
          | Variable<
              any,
              string
            > /** cursor to stream the results returned by the query */;
        cursor:
          | Array<ValueTypes["clients_stream_cursor_input"] | undefined | null>
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["clients_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["clients"],
    ];
    refresh_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["refresh_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["refresh_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["refresh_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens"],
    ];
    refresh_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ValueTypes["refresh_tokens_select_column"]>
          | undefined
          | null
          | Variable<any, string> /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null
          | Variable<
              any,
              string
            > /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null
          | Variable<any, string> /** sort the rows by one or more columns */;
        order_by?:
          | Array<ValueTypes["refresh_tokens_order_by"]>
          | undefined
          | null
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["refresh_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens_aggregate"],
    ];
    refresh_tokens_by_pk?: [
      { token_hash: string | Variable<any, string> },
      ValueTypes["refresh_tokens"],
    ];
    refresh_tokens_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size:
          | number
          | Variable<
              any,
              string
            > /** cursor to stream the results returned by the query */;
        cursor:
          | Array<
              | ValueTypes["refresh_tokens_stream_cursor_input"]
              | undefined
              | null
            >
          | Variable<any, string> /** filter the rows returned */;
        where?:
          | ValueTypes["refresh_tokens_bool_exp"]
          | undefined
          | null
          | Variable<any, string>;
      },
      ValueTypes["refresh_tokens"],
    ];
    __typename?: boolean | `@${string}`;
  }>;
  ["uuid"]: unknown;
  /** Boolean expression to compare columns of type "uuid". All fields are combined with logical 'AND'. */
  ["uuid_comparison_exp"]: {
    _eq?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    _gt?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    _gte?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    _in?: Array<ValueTypes["uuid"]> | undefined | null | Variable<any, string>;
    _is_null?: boolean | undefined | null | Variable<any, string>;
    _lt?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    _lte?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    _neq?: ValueTypes["uuid"] | undefined | null | Variable<any, string>;
    _nin?: Array<ValueTypes["uuid"]> | undefined | null | Variable<any, string>;
  };
};

export type ResolverInputTypes = {
  ["schema"]: AliasType<{
    query?: ResolverInputTypes["query_root"];
    mutation?: ResolverInputTypes["mutation_root"];
    subscription?: ResolverInputTypes["subscription_root"];
    __typename?: boolean | `@${string}`;
  }>;
  /** OAuth 2.0 access code grants. */
  ["access_codes"]: AliasType<{
    access_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_tokens"],
    ];
    access_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_tokens_aggregate"],
    ];
    client?: boolean | `@${string}`;
    /** An object relationship */
    clients?: ResolverInputTypes["clients"];
    code?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    refresh_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["refresh_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["refresh_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?:
          | ResolverInputTypes["refresh_tokens_bool_exp"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens"],
    ];
    refresh_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["refresh_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["refresh_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?:
          | ResolverInputTypes["refresh_tokens_bool_exp"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens_aggregate"],
    ];
    scope?: boolean | `@${string}`;
    used?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "access_codes" */
  ["access_codes_aggregate"]: AliasType<{
    aggregate?: ResolverInputTypes["access_codes_aggregate_fields"];
    nodes?: ResolverInputTypes["access_codes"];
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate fields of "access_codes" */
  ["access_codes_aggregate_fields"]: AliasType<{
    count?: [
      {
        columns?:
          | Array<ResolverInputTypes["access_codes_select_column"]>
          | undefined
          | null;
        distinct?: boolean | undefined | null;
      },
      boolean | `@${string}`,
    ];
    max?: ResolverInputTypes["access_codes_max_fields"];
    min?: ResolverInputTypes["access_codes_min_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** Boolean expression to filter rows from the table "access_codes". All fields are combined with a logical 'AND'. */
  ["access_codes_bool_exp"]: {
    _and?:
      | Array<ResolverInputTypes["access_codes_bool_exp"]>
      | undefined
      | null;
    _not?: ResolverInputTypes["access_codes_bool_exp"] | undefined | null;
    _or?: Array<ResolverInputTypes["access_codes_bool_exp"]> | undefined | null;
    access_tokens?:
      | ResolverInputTypes["access_tokens_bool_exp"]
      | undefined
      | null;
    access_tokens_aggregate?:
      | ResolverInputTypes["access_tokens_aggregate_bool_exp"]
      | undefined
      | null;
    client?: ResolverInputTypes["uuid_comparison_exp"] | undefined | null;
    clients?: ResolverInputTypes["clients_bool_exp"] | undefined | null;
    code?: ResolverInputTypes["uuid_comparison_exp"] | undefined | null;
    id?: ResolverInputTypes["uuid_comparison_exp"] | undefined | null;
    refresh_tokens?:
      | ResolverInputTypes["refresh_tokens_bool_exp"]
      | undefined
      | null;
    refresh_tokens_aggregate?:
      | ResolverInputTypes["refresh_tokens_aggregate_bool_exp"]
      | undefined
      | null;
    scope?:
      | ResolverInputTypes["String_array_comparison_exp"]
      | undefined
      | null;
    used?: ResolverInputTypes["Boolean_comparison_exp"] | undefined | null;
    user_id?: ResolverInputTypes["String_comparison_exp"] | undefined | null;
  };
  /** unique or primary key constraints on table "access_codes" */
  ["access_codes_constraint"]: access_codes_constraint;
  /** input type for inserting data into table "access_codes" */
  ["access_codes_insert_input"]: {
    access_tokens?:
      | ResolverInputTypes["access_tokens_arr_rel_insert_input"]
      | undefined
      | null;
    client?: ResolverInputTypes["uuid"] | undefined | null;
    clients?:
      | ResolverInputTypes["clients_obj_rel_insert_input"]
      | undefined
      | null;
    code?: ResolverInputTypes["uuid"] | undefined | null;
    id?: ResolverInputTypes["uuid"] | undefined | null;
    refresh_tokens?:
      | ResolverInputTypes["refresh_tokens_arr_rel_insert_input"]
      | undefined
      | null;
    scope?: Array<string> | undefined | null;
    used?: boolean | undefined | null;
    user_id?: string | undefined | null;
  };
  /** aggregate max on columns */
  ["access_codes_max_fields"]: AliasType<{
    client?: boolean | `@${string}`;
    code?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    scope?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate min on columns */
  ["access_codes_min_fields"]: AliasType<{
    client?: boolean | `@${string}`;
    code?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    scope?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** response of any mutation on the table "access_codes" */
  ["access_codes_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ResolverInputTypes["access_codes"];
    __typename?: boolean | `@${string}`;
  }>;
  /** input type for inserting object relation for remote table "access_codes" */
  ["access_codes_obj_rel_insert_input"]: {
    data: ResolverInputTypes["access_codes_insert_input"];
    /** upsert condition */
    on_conflict?:
      | ResolverInputTypes["access_codes_on_conflict"]
      | undefined
      | null;
  };
  /** on_conflict condition type for table "access_codes" */
  ["access_codes_on_conflict"]: {
    constraint: ResolverInputTypes["access_codes_constraint"];
    update_columns: Array<ResolverInputTypes["access_codes_update_column"]>;
    where?: ResolverInputTypes["access_codes_bool_exp"] | undefined | null;
  };
  /** Ordering options when selecting data from "access_codes". */
  ["access_codes_order_by"]: {
    access_tokens_aggregate?:
      | ResolverInputTypes["access_tokens_aggregate_order_by"]
      | undefined
      | null;
    client?: ResolverInputTypes["order_by"] | undefined | null;
    clients?: ResolverInputTypes["clients_order_by"] | undefined | null;
    code?: ResolverInputTypes["order_by"] | undefined | null;
    id?: ResolverInputTypes["order_by"] | undefined | null;
    refresh_tokens_aggregate?:
      | ResolverInputTypes["refresh_tokens_aggregate_order_by"]
      | undefined
      | null;
    scope?: ResolverInputTypes["order_by"] | undefined | null;
    used?: ResolverInputTypes["order_by"] | undefined | null;
    user_id?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** primary key columns input for table: access_codes */
  ["access_codes_pk_columns_input"]: {
    id: ResolverInputTypes["uuid"];
  };
  /** select columns of table "access_codes" */
  ["access_codes_select_column"]: access_codes_select_column;
  /** input type for updating data in table "access_codes" */
  ["access_codes_set_input"]: {
    client?: ResolverInputTypes["uuid"] | undefined | null;
    code?: ResolverInputTypes["uuid"] | undefined | null;
    id?: ResolverInputTypes["uuid"] | undefined | null;
    scope?: Array<string> | undefined | null;
    used?: boolean | undefined | null;
    user_id?: string | undefined | null;
  };
  /** Streaming cursor of the table "access_codes" */
  ["access_codes_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ResolverInputTypes["access_codes_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null;
  };
  /** Initial value of the column from where the streaming should start */
  ["access_codes_stream_cursor_value_input"]: {
    client?: ResolverInputTypes["uuid"] | undefined | null;
    code?: ResolverInputTypes["uuid"] | undefined | null;
    id?: ResolverInputTypes["uuid"] | undefined | null;
    scope?: Array<string> | undefined | null;
    used?: boolean | undefined | null;
    user_id?: string | undefined | null;
  };
  /** update columns of table "access_codes" */
  ["access_codes_update_column"]: access_codes_update_column;
  ["access_codes_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: ResolverInputTypes["access_codes_set_input"] | undefined | null;
    /** filter the rows which have to be updated */
    where: ResolverInputTypes["access_codes_bool_exp"];
  };
  /** Minted OAuth 2.0 access tokens. Used to track revocations in the event of an access code replay. */
  ["access_tokens"]: AliasType<{
    access_code?: boolean | `@${string}`;
    jti?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "access_tokens" */
  ["access_tokens_aggregate"]: AliasType<{
    aggregate?: ResolverInputTypes["access_tokens_aggregate_fields"];
    nodes?: ResolverInputTypes["access_tokens"];
    __typename?: boolean | `@${string}`;
  }>;
  ["access_tokens_aggregate_bool_exp"]: {
    count?:
      | ResolverInputTypes["access_tokens_aggregate_bool_exp_count"]
      | undefined
      | null;
  };
  ["access_tokens_aggregate_bool_exp_count"]: {
    arguments?:
      | Array<ResolverInputTypes["access_tokens_select_column"]>
      | undefined
      | null;
    distinct?: boolean | undefined | null;
    filter?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
    predicate: ResolverInputTypes["Int_comparison_exp"];
  };
  /** aggregate fields of "access_tokens" */
  ["access_tokens_aggregate_fields"]: AliasType<{
    count?: [
      {
        columns?:
          | Array<ResolverInputTypes["access_tokens_select_column"]>
          | undefined
          | null;
        distinct?: boolean | undefined | null;
      },
      boolean | `@${string}`,
    ];
    max?: ResolverInputTypes["access_tokens_max_fields"];
    min?: ResolverInputTypes["access_tokens_min_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** order by aggregate values of table "access_tokens" */
  ["access_tokens_aggregate_order_by"]: {
    count?: ResolverInputTypes["order_by"] | undefined | null;
    max?: ResolverInputTypes["access_tokens_max_order_by"] | undefined | null;
    min?: ResolverInputTypes["access_tokens_min_order_by"] | undefined | null;
  };
  /** input type for inserting array relation for remote table "access_tokens" */
  ["access_tokens_arr_rel_insert_input"]: {
    data: Array<ResolverInputTypes["access_tokens_insert_input"]>;
    /** upsert condition */
    on_conflict?:
      | ResolverInputTypes["access_tokens_on_conflict"]
      | undefined
      | null;
  };
  /** Boolean expression to filter rows from the table "access_tokens". All fields are combined with a logical 'AND'. */
  ["access_tokens_bool_exp"]: {
    _and?:
      | Array<ResolverInputTypes["access_tokens_bool_exp"]>
      | undefined
      | null;
    _not?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
    _or?:
      | Array<ResolverInputTypes["access_tokens_bool_exp"]>
      | undefined
      | null;
    access_code?: ResolverInputTypes["uuid_comparison_exp"] | undefined | null;
    jti?: ResolverInputTypes["String_comparison_exp"] | undefined | null;
  };
  /** unique or primary key constraints on table "access_tokens" */
  ["access_tokens_constraint"]: access_tokens_constraint;
  /** input type for inserting data into table "access_tokens" */
  ["access_tokens_insert_input"]: {
    access_code?: ResolverInputTypes["uuid"] | undefined | null;
    jti?: string | undefined | null;
  };
  /** aggregate max on columns */
  ["access_tokens_max_fields"]: AliasType<{
    access_code?: boolean | `@${string}`;
    jti?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** order by max() on columns of table "access_tokens" */
  ["access_tokens_max_order_by"]: {
    access_code?: ResolverInputTypes["order_by"] | undefined | null;
    jti?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** aggregate min on columns */
  ["access_tokens_min_fields"]: AliasType<{
    access_code?: boolean | `@${string}`;
    jti?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** order by min() on columns of table "access_tokens" */
  ["access_tokens_min_order_by"]: {
    access_code?: ResolverInputTypes["order_by"] | undefined | null;
    jti?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** response of any mutation on the table "access_tokens" */
  ["access_tokens_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ResolverInputTypes["access_tokens"];
    __typename?: boolean | `@${string}`;
  }>;
  /** on_conflict condition type for table "access_tokens" */
  ["access_tokens_on_conflict"]: {
    constraint: ResolverInputTypes["access_tokens_constraint"];
    update_columns: Array<ResolverInputTypes["access_tokens_update_column"]>;
    where?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
  };
  /** Ordering options when selecting data from "access_tokens". */
  ["access_tokens_order_by"]: {
    access_code?: ResolverInputTypes["order_by"] | undefined | null;
    jti?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** primary key columns input for table: access_tokens */
  ["access_tokens_pk_columns_input"]: {
    jti: string;
  };
  /** select columns of table "access_tokens" */
  ["access_tokens_select_column"]: access_tokens_select_column;
  /** input type for updating data in table "access_tokens" */
  ["access_tokens_set_input"]: {
    access_code?: ResolverInputTypes["uuid"] | undefined | null;
    jti?: string | undefined | null;
  };
  /** Streaming cursor of the table "access_tokens" */
  ["access_tokens_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ResolverInputTypes["access_tokens_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null;
  };
  /** Initial value of the column from where the streaming should start */
  ["access_tokens_stream_cursor_value_input"]: {
    access_code?: ResolverInputTypes["uuid"] | undefined | null;
    jti?: string | undefined | null;
  };
  /** update columns of table "access_tokens" */
  ["access_tokens_update_column"]: access_tokens_update_column;
  ["access_tokens_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: ResolverInputTypes["access_tokens_set_input"] | undefined | null;
    /** filter the rows which have to be updated */
    where: ResolverInputTypes["access_tokens_bool_exp"];
  };
  /** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
  ["Boolean_comparison_exp"]: {
    _eq?: boolean | undefined | null;
    _gt?: boolean | undefined | null;
    _gte?: boolean | undefined | null;
    _in?: Array<boolean> | undefined | null;
    _is_null?: boolean | undefined | null;
    _lt?: boolean | undefined | null;
    _lte?: boolean | undefined | null;
    _neq?: boolean | undefined | null;
    _nin?: Array<boolean> | undefined | null;
  };
  /** Burger counts for users. */
  ["burgers"]: AliasType<{
    count?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "burgers" */
  ["burgers_aggregate"]: AliasType<{
    aggregate?: ResolverInputTypes["burgers_aggregate_fields"];
    nodes?: ResolverInputTypes["burgers"];
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate fields of "burgers" */
  ["burgers_aggregate_fields"]: AliasType<{
    avg?: ResolverInputTypes["burgers_avg_fields"];
    count?: [
      {
        columns?:
          | Array<ResolverInputTypes["burgers_select_column"]>
          | undefined
          | null;
        distinct?: boolean | undefined | null;
      },
      boolean | `@${string}`,
    ];
    max?: ResolverInputTypes["burgers_max_fields"];
    min?: ResolverInputTypes["burgers_min_fields"];
    stddev?: ResolverInputTypes["burgers_stddev_fields"];
    stddev_pop?: ResolverInputTypes["burgers_stddev_pop_fields"];
    stddev_samp?: ResolverInputTypes["burgers_stddev_samp_fields"];
    sum?: ResolverInputTypes["burgers_sum_fields"];
    var_pop?: ResolverInputTypes["burgers_var_pop_fields"];
    var_samp?: ResolverInputTypes["burgers_var_samp_fields"];
    variance?: ResolverInputTypes["burgers_variance_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate avg on columns */
  ["burgers_avg_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** Boolean expression to filter rows from the table "burgers". All fields are combined with a logical 'AND'. */
  ["burgers_bool_exp"]: {
    _and?: Array<ResolverInputTypes["burgers_bool_exp"]> | undefined | null;
    _not?: ResolverInputTypes["burgers_bool_exp"] | undefined | null;
    _or?: Array<ResolverInputTypes["burgers_bool_exp"]> | undefined | null;
    count?: ResolverInputTypes["Int_comparison_exp"] | undefined | null;
    user_id?: ResolverInputTypes["String_comparison_exp"] | undefined | null;
  };
  /** unique or primary key constraints on table "burgers" */
  ["burgers_constraint"]: burgers_constraint;
  /** input type for incrementing numeric columns in table "burgers" */
  ["burgers_inc_input"]: {
    count?: number | undefined | null;
  };
  /** input type for inserting data into table "burgers" */
  ["burgers_insert_input"]: {
    count?: number | undefined | null;
    user_id?: string | undefined | null;
  };
  /** aggregate max on columns */
  ["burgers_max_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate min on columns */
  ["burgers_min_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    user_id?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** response of any mutation on the table "burgers" */
  ["burgers_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ResolverInputTypes["burgers"];
    __typename?: boolean | `@${string}`;
  }>;
  /** on_conflict condition type for table "burgers" */
  ["burgers_on_conflict"]: {
    constraint: ResolverInputTypes["burgers_constraint"];
    update_columns: Array<ResolverInputTypes["burgers_update_column"]>;
    where?: ResolverInputTypes["burgers_bool_exp"] | undefined | null;
  };
  /** Ordering options when selecting data from "burgers". */
  ["burgers_order_by"]: {
    count?: ResolverInputTypes["order_by"] | undefined | null;
    user_id?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** primary key columns input for table: burgers */
  ["burgers_pk_columns_input"]: {
    user_id: string;
  };
  /** select columns of table "burgers" */
  ["burgers_select_column"]: burgers_select_column;
  /** input type for updating data in table "burgers" */
  ["burgers_set_input"]: {
    count?: number | undefined | null;
    user_id?: string | undefined | null;
  };
  /** aggregate stddev on columns */
  ["burgers_stddev_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate stddev_pop on columns */
  ["burgers_stddev_pop_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate stddev_samp on columns */
  ["burgers_stddev_samp_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** Streaming cursor of the table "burgers" */
  ["burgers_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ResolverInputTypes["burgers_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null;
  };
  /** Initial value of the column from where the streaming should start */
  ["burgers_stream_cursor_value_input"]: {
    count?: number | undefined | null;
    user_id?: string | undefined | null;
  };
  /** aggregate sum on columns */
  ["burgers_sum_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** update columns of table "burgers" */
  ["burgers_update_column"]: burgers_update_column;
  ["burgers_updates"]: {
    /** increments the numeric columns with given value of the filtered values */
    _inc?: ResolverInputTypes["burgers_inc_input"] | undefined | null;
    /** sets the columns of the filtered rows to the given values */
    _set?: ResolverInputTypes["burgers_set_input"] | undefined | null;
    /** filter the rows which have to be updated */
    where: ResolverInputTypes["burgers_bool_exp"];
  };
  /** aggregate var_pop on columns */
  ["burgers_var_pop_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate var_samp on columns */
  ["burgers_var_samp_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate variance on columns */
  ["burgers_variance_fields"]: AliasType<{
    count?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** Registered OAuth 2.0 clients. */
  ["clients"]: AliasType<{
    client_id?: boolean | `@${string}`;
    client_secret_hash?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    name?: boolean | `@${string}`;
    redirect_uri?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "clients" */
  ["clients_aggregate"]: AliasType<{
    aggregate?: ResolverInputTypes["clients_aggregate_fields"];
    nodes?: ResolverInputTypes["clients"];
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate fields of "clients" */
  ["clients_aggregate_fields"]: AliasType<{
    count?: [
      {
        columns?:
          | Array<ResolverInputTypes["clients_select_column"]>
          | undefined
          | null;
        distinct?: boolean | undefined | null;
      },
      boolean | `@${string}`,
    ];
    max?: ResolverInputTypes["clients_max_fields"];
    min?: ResolverInputTypes["clients_min_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** Boolean expression to filter rows from the table "clients". All fields are combined with a logical 'AND'. */
  ["clients_bool_exp"]: {
    _and?: Array<ResolverInputTypes["clients_bool_exp"]> | undefined | null;
    _not?: ResolverInputTypes["clients_bool_exp"] | undefined | null;
    _or?: Array<ResolverInputTypes["clients_bool_exp"]> | undefined | null;
    client_id?: ResolverInputTypes["String_comparison_exp"] | undefined | null;
    client_secret_hash?:
      | ResolverInputTypes["String_comparison_exp"]
      | undefined
      | null;
    id?: ResolverInputTypes["uuid_comparison_exp"] | undefined | null;
    name?: ResolverInputTypes["String_comparison_exp"] | undefined | null;
    redirect_uri?:
      | ResolverInputTypes["String_comparison_exp"]
      | undefined
      | null;
  };
  /** unique or primary key constraints on table "clients" */
  ["clients_constraint"]: clients_constraint;
  /** input type for inserting data into table "clients" */
  ["clients_insert_input"]: {
    client_id?: string | undefined | null;
    client_secret_hash?: string | undefined | null;
    id?: ResolverInputTypes["uuid"] | undefined | null;
    name?: string | undefined | null;
    redirect_uri?: string | undefined | null;
  };
  /** aggregate max on columns */
  ["clients_max_fields"]: AliasType<{
    client_id?: boolean | `@${string}`;
    client_secret_hash?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    name?: boolean | `@${string}`;
    redirect_uri?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregate min on columns */
  ["clients_min_fields"]: AliasType<{
    client_id?: boolean | `@${string}`;
    client_secret_hash?: boolean | `@${string}`;
    id?: boolean | `@${string}`;
    name?: boolean | `@${string}`;
    redirect_uri?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** response of any mutation on the table "clients" */
  ["clients_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ResolverInputTypes["clients"];
    __typename?: boolean | `@${string}`;
  }>;
  /** input type for inserting object relation for remote table "clients" */
  ["clients_obj_rel_insert_input"]: {
    data: ResolverInputTypes["clients_insert_input"];
    /** upsert condition */
    on_conflict?: ResolverInputTypes["clients_on_conflict"] | undefined | null;
  };
  /** on_conflict condition type for table "clients" */
  ["clients_on_conflict"]: {
    constraint: ResolverInputTypes["clients_constraint"];
    update_columns: Array<ResolverInputTypes["clients_update_column"]>;
    where?: ResolverInputTypes["clients_bool_exp"] | undefined | null;
  };
  /** Ordering options when selecting data from "clients". */
  ["clients_order_by"]: {
    client_id?: ResolverInputTypes["order_by"] | undefined | null;
    client_secret_hash?: ResolverInputTypes["order_by"] | undefined | null;
    id?: ResolverInputTypes["order_by"] | undefined | null;
    name?: ResolverInputTypes["order_by"] | undefined | null;
    redirect_uri?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** primary key columns input for table: clients */
  ["clients_pk_columns_input"]: {
    id: ResolverInputTypes["uuid"];
  };
  /** select columns of table "clients" */
  ["clients_select_column"]: clients_select_column;
  /** input type for updating data in table "clients" */
  ["clients_set_input"]: {
    client_id?: string | undefined | null;
    client_secret_hash?: string | undefined | null;
    id?: ResolverInputTypes["uuid"] | undefined | null;
    name?: string | undefined | null;
    redirect_uri?: string | undefined | null;
  };
  /** Streaming cursor of the table "clients" */
  ["clients_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ResolverInputTypes["clients_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null;
  };
  /** Initial value of the column from where the streaming should start */
  ["clients_stream_cursor_value_input"]: {
    client_id?: string | undefined | null;
    client_secret_hash?: string | undefined | null;
    id?: ResolverInputTypes["uuid"] | undefined | null;
    name?: string | undefined | null;
    redirect_uri?: string | undefined | null;
  };
  /** update columns of table "clients" */
  ["clients_update_column"]: clients_update_column;
  ["clients_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: ResolverInputTypes["clients_set_input"] | undefined | null;
    /** filter the rows which have to be updated */
    where: ResolverInputTypes["clients_bool_exp"];
  };
  /** ordering argument of a cursor */
  ["cursor_ordering"]: cursor_ordering;
  /** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
  ["Int_comparison_exp"]: {
    _eq?: number | undefined | null;
    _gt?: number | undefined | null;
    _gte?: number | undefined | null;
    _in?: Array<number> | undefined | null;
    _is_null?: boolean | undefined | null;
    _lt?: number | undefined | null;
    _lte?: number | undefined | null;
    _neq?: number | undefined | null;
    _nin?: Array<number> | undefined | null;
  };
  /** mutation root */
  ["mutation_root"]: AliasType<{
    delete_access_codes?: [
      {
        /** filter the rows which have to be deleted */
        where: ResolverInputTypes["access_codes_bool_exp"];
      },
      ResolverInputTypes["access_codes_mutation_response"],
    ];
    delete_access_codes_by_pk?: [
      { id: ResolverInputTypes["uuid"] },
      ResolverInputTypes["access_codes"],
    ];
    delete_access_tokens?: [
      {
        /** filter the rows which have to be deleted */
        where: ResolverInputTypes["access_tokens_bool_exp"];
      },
      ResolverInputTypes["access_tokens_mutation_response"],
    ];
    delete_access_tokens_by_pk?: [
      { jti: string },
      ResolverInputTypes["access_tokens"],
    ];
    delete_burgers?: [
      {
        /** filter the rows which have to be deleted */
        where: ResolverInputTypes["burgers_bool_exp"];
      },
      ResolverInputTypes["burgers_mutation_response"],
    ];
    delete_burgers_by_pk?: [{ user_id: string }, ResolverInputTypes["burgers"]];
    delete_clients?: [
      {
        /** filter the rows which have to be deleted */
        where: ResolverInputTypes["clients_bool_exp"];
      },
      ResolverInputTypes["clients_mutation_response"],
    ];
    delete_clients_by_pk?: [
      { id: ResolverInputTypes["uuid"] },
      ResolverInputTypes["clients"],
    ];
    delete_refresh_tokens?: [
      {
        /** filter the rows which have to be deleted */
        where: ResolverInputTypes["refresh_tokens_bool_exp"];
      },
      ResolverInputTypes["refresh_tokens_mutation_response"],
    ];
    delete_refresh_tokens_by_pk?: [
      { token_hash: string },
      ResolverInputTypes["refresh_tokens"],
    ];
    insert_access_codes?: [
      {
        /** the rows to be inserted */
        objects: Array<
          ResolverInputTypes["access_codes_insert_input"]
        > /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["access_codes_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["access_codes_mutation_response"],
    ];
    insert_access_codes_one?: [
      {
        /** the row to be inserted */
        object: ResolverInputTypes["access_codes_insert_input"] /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["access_codes_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["access_codes"],
    ];
    insert_access_tokens?: [
      {
        /** the rows to be inserted */
        objects: Array<
          ResolverInputTypes["access_tokens_insert_input"]
        > /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["access_tokens_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["access_tokens_mutation_response"],
    ];
    insert_access_tokens_one?: [
      {
        /** the row to be inserted */
        object: ResolverInputTypes["access_tokens_insert_input"] /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["access_tokens_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["access_tokens"],
    ];
    insert_burgers?: [
      {
        /** the rows to be inserted */
        objects: Array<
          ResolverInputTypes["burgers_insert_input"]
        > /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["burgers_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["burgers_mutation_response"],
    ];
    insert_burgers_one?: [
      {
        /** the row to be inserted */
        object: ResolverInputTypes["burgers_insert_input"] /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["burgers_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["burgers"],
    ];
    insert_clients?: [
      {
        /** the rows to be inserted */
        objects: Array<
          ResolverInputTypes["clients_insert_input"]
        > /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["clients_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["clients_mutation_response"],
    ];
    insert_clients_one?: [
      {
        /** the row to be inserted */
        object: ResolverInputTypes["clients_insert_input"] /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["clients_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["clients"],
    ];
    insert_refresh_tokens?: [
      {
        /** the rows to be inserted */
        objects: Array<
          ResolverInputTypes["refresh_tokens_insert_input"]
        > /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["refresh_tokens_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens_mutation_response"],
    ];
    insert_refresh_tokens_one?: [
      {
        /** the row to be inserted */
        object: ResolverInputTypes["refresh_tokens_insert_input"] /** upsert condition */;
        on_conflict?:
          | ResolverInputTypes["refresh_tokens_on_conflict"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens"],
    ];
    update_access_codes?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ResolverInputTypes["access_codes_set_input"]
          | undefined
          | null /** filter the rows which have to be updated */;
        where: ResolverInputTypes["access_codes_bool_exp"];
      },
      ResolverInputTypes["access_codes_mutation_response"],
    ];
    update_access_codes_by_pk?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?: ResolverInputTypes["access_codes_set_input"] | undefined | null;
        pk_columns: ResolverInputTypes["access_codes_pk_columns_input"];
      },
      ResolverInputTypes["access_codes"],
    ];
    update_access_codes_many?: [
      {
        /** updates to execute, in order */
        updates: Array<ResolverInputTypes["access_codes_updates"]>;
      },
      ResolverInputTypes["access_codes_mutation_response"],
    ];
    update_access_tokens?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ResolverInputTypes["access_tokens_set_input"]
          | undefined
          | null /** filter the rows which have to be updated */;
        where: ResolverInputTypes["access_tokens_bool_exp"];
      },
      ResolverInputTypes["access_tokens_mutation_response"],
    ];
    update_access_tokens_by_pk?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?: ResolverInputTypes["access_tokens_set_input"] | undefined | null;
        pk_columns: ResolverInputTypes["access_tokens_pk_columns_input"];
      },
      ResolverInputTypes["access_tokens"],
    ];
    update_access_tokens_many?: [
      {
        /** updates to execute, in order */
        updates: Array<ResolverInputTypes["access_tokens_updates"]>;
      },
      ResolverInputTypes["access_tokens_mutation_response"],
    ];
    update_burgers?: [
      {
        /** increments the numeric columns with given value of the filtered values */
        _inc?:
          | ResolverInputTypes["burgers_inc_input"]
          | undefined
          | null /** sets the columns of the filtered rows to the given values */;
        _set?:
          | ResolverInputTypes["burgers_set_input"]
          | undefined
          | null /** filter the rows which have to be updated */;
        where: ResolverInputTypes["burgers_bool_exp"];
      },
      ResolverInputTypes["burgers_mutation_response"],
    ];
    update_burgers_by_pk?: [
      {
        /** increments the numeric columns with given value of the filtered values */
        _inc?:
          | ResolverInputTypes["burgers_inc_input"]
          | undefined
          | null /** sets the columns of the filtered rows to the given values */;
        _set?: ResolverInputTypes["burgers_set_input"] | undefined | null;
        pk_columns: ResolverInputTypes["burgers_pk_columns_input"];
      },
      ResolverInputTypes["burgers"],
    ];
    update_burgers_many?: [
      {
        /** updates to execute, in order */
        updates: Array<ResolverInputTypes["burgers_updates"]>;
      },
      ResolverInputTypes["burgers_mutation_response"],
    ];
    update_clients?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ResolverInputTypes["clients_set_input"]
          | undefined
          | null /** filter the rows which have to be updated */;
        where: ResolverInputTypes["clients_bool_exp"];
      },
      ResolverInputTypes["clients_mutation_response"],
    ];
    update_clients_by_pk?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?: ResolverInputTypes["clients_set_input"] | undefined | null;
        pk_columns: ResolverInputTypes["clients_pk_columns_input"];
      },
      ResolverInputTypes["clients"],
    ];
    update_clients_many?: [
      {
        /** updates to execute, in order */
        updates: Array<ResolverInputTypes["clients_updates"]>;
      },
      ResolverInputTypes["clients_mutation_response"],
    ];
    update_refresh_tokens?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ResolverInputTypes["refresh_tokens_set_input"]
          | undefined
          | null /** filter the rows which have to be updated */;
        where: ResolverInputTypes["refresh_tokens_bool_exp"];
      },
      ResolverInputTypes["refresh_tokens_mutation_response"],
    ];
    update_refresh_tokens_by_pk?: [
      {
        /** sets the columns of the filtered rows to the given values */
        _set?:
          | ResolverInputTypes["refresh_tokens_set_input"]
          | undefined
          | null;
        pk_columns: ResolverInputTypes["refresh_tokens_pk_columns_input"];
      },
      ResolverInputTypes["refresh_tokens"],
    ];
    update_refresh_tokens_many?: [
      {
        /** updates to execute, in order */
        updates: Array<ResolverInputTypes["refresh_tokens_updates"]>;
      },
      ResolverInputTypes["refresh_tokens_mutation_response"],
    ];
    __typename?: boolean | `@${string}`;
  }>;
  /** column ordering options */
  ["order_by"]: order_by;
  ["query_root"]: AliasType<{
    access_codes?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_codes_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_codes_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_codes_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_codes"],
    ];
    access_codes_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_codes_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_codes_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_codes_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_codes_aggregate"],
    ];
    access_codes_by_pk?: [
      { id: ResolverInputTypes["uuid"] },
      ResolverInputTypes["access_codes"],
    ];
    access_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_tokens"],
    ];
    access_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_tokens_aggregate"],
    ];
    access_tokens_by_pk?: [
      { jti: string },
      ResolverInputTypes["access_tokens"],
    ];
    burgers?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["burgers_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["burgers_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["burgers_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["burgers"],
    ];
    burgers_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["burgers_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["burgers_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["burgers_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["burgers_aggregate"],
    ];
    burgers_by_pk?: [{ user_id: string }, ResolverInputTypes["burgers"]];
    clients?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["clients_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["clients_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["clients_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["clients"],
    ];
    clients_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["clients_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["clients_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["clients_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["clients_aggregate"],
    ];
    clients_by_pk?: [
      { id: ResolverInputTypes["uuid"] },
      ResolverInputTypes["clients"],
    ];
    refresh_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["refresh_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["refresh_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?:
          | ResolverInputTypes["refresh_tokens_bool_exp"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens"],
    ];
    refresh_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["refresh_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["refresh_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?:
          | ResolverInputTypes["refresh_tokens_bool_exp"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens_aggregate"],
    ];
    refresh_tokens_by_pk?: [
      { token_hash: string },
      ResolverInputTypes["refresh_tokens"],
    ];
    __typename?: boolean | `@${string}`;
  }>;
  /** OAuth 2.0 refresh tokens associated with auth codes. */
  ["refresh_tokens"]: AliasType<{
    /** An object relationship */
    access_code?: ResolverInputTypes["access_codes"];
    auth_code?: boolean | `@${string}`;
    token_hash?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** aggregated selection of "refresh_tokens" */
  ["refresh_tokens_aggregate"]: AliasType<{
    aggregate?: ResolverInputTypes["refresh_tokens_aggregate_fields"];
    nodes?: ResolverInputTypes["refresh_tokens"];
    __typename?: boolean | `@${string}`;
  }>;
  ["refresh_tokens_aggregate_bool_exp"]: {
    count?:
      | ResolverInputTypes["refresh_tokens_aggregate_bool_exp_count"]
      | undefined
      | null;
  };
  ["refresh_tokens_aggregate_bool_exp_count"]: {
    arguments?:
      | Array<ResolverInputTypes["refresh_tokens_select_column"]>
      | undefined
      | null;
    distinct?: boolean | undefined | null;
    filter?: ResolverInputTypes["refresh_tokens_bool_exp"] | undefined | null;
    predicate: ResolverInputTypes["Int_comparison_exp"];
  };
  /** aggregate fields of "refresh_tokens" */
  ["refresh_tokens_aggregate_fields"]: AliasType<{
    count?: [
      {
        columns?:
          | Array<ResolverInputTypes["refresh_tokens_select_column"]>
          | undefined
          | null;
        distinct?: boolean | undefined | null;
      },
      boolean | `@${string}`,
    ];
    max?: ResolverInputTypes["refresh_tokens_max_fields"];
    min?: ResolverInputTypes["refresh_tokens_min_fields"];
    __typename?: boolean | `@${string}`;
  }>;
  /** order by aggregate values of table "refresh_tokens" */
  ["refresh_tokens_aggregate_order_by"]: {
    count?: ResolverInputTypes["order_by"] | undefined | null;
    max?: ResolverInputTypes["refresh_tokens_max_order_by"] | undefined | null;
    min?: ResolverInputTypes["refresh_tokens_min_order_by"] | undefined | null;
  };
  /** input type for inserting array relation for remote table "refresh_tokens" */
  ["refresh_tokens_arr_rel_insert_input"]: {
    data: Array<ResolverInputTypes["refresh_tokens_insert_input"]>;
    /** upsert condition */
    on_conflict?:
      | ResolverInputTypes["refresh_tokens_on_conflict"]
      | undefined
      | null;
  };
  /** Boolean expression to filter rows from the table "refresh_tokens". All fields are combined with a logical 'AND'. */
  ["refresh_tokens_bool_exp"]: {
    _and?:
      | Array<ResolverInputTypes["refresh_tokens_bool_exp"]>
      | undefined
      | null;
    _not?: ResolverInputTypes["refresh_tokens_bool_exp"] | undefined | null;
    _or?:
      | Array<ResolverInputTypes["refresh_tokens_bool_exp"]>
      | undefined
      | null;
    access_code?:
      | ResolverInputTypes["access_codes_bool_exp"]
      | undefined
      | null;
    auth_code?: ResolverInputTypes["uuid_comparison_exp"] | undefined | null;
    token_hash?: ResolverInputTypes["String_comparison_exp"] | undefined | null;
  };
  /** unique or primary key constraints on table "refresh_tokens" */
  ["refresh_tokens_constraint"]: refresh_tokens_constraint;
  /** input type for inserting data into table "refresh_tokens" */
  ["refresh_tokens_insert_input"]: {
    access_code?:
      | ResolverInputTypes["access_codes_obj_rel_insert_input"]
      | undefined
      | null;
    auth_code?: ResolverInputTypes["uuid"] | undefined | null;
    token_hash?: string | undefined | null;
  };
  /** aggregate max on columns */
  ["refresh_tokens_max_fields"]: AliasType<{
    auth_code?: boolean | `@${string}`;
    token_hash?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** order by max() on columns of table "refresh_tokens" */
  ["refresh_tokens_max_order_by"]: {
    auth_code?: ResolverInputTypes["order_by"] | undefined | null;
    token_hash?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** aggregate min on columns */
  ["refresh_tokens_min_fields"]: AliasType<{
    auth_code?: boolean | `@${string}`;
    token_hash?: boolean | `@${string}`;
    __typename?: boolean | `@${string}`;
  }>;
  /** order by min() on columns of table "refresh_tokens" */
  ["refresh_tokens_min_order_by"]: {
    auth_code?: ResolverInputTypes["order_by"] | undefined | null;
    token_hash?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** response of any mutation on the table "refresh_tokens" */
  ["refresh_tokens_mutation_response"]: AliasType<{
    /** number of rows affected by the mutation */
    affected_rows?: boolean | `@${string}`;
    /** data from the rows affected by the mutation */
    returning?: ResolverInputTypes["refresh_tokens"];
    __typename?: boolean | `@${string}`;
  }>;
  /** on_conflict condition type for table "refresh_tokens" */
  ["refresh_tokens_on_conflict"]: {
    constraint: ResolverInputTypes["refresh_tokens_constraint"];
    update_columns: Array<ResolverInputTypes["refresh_tokens_update_column"]>;
    where?: ResolverInputTypes["refresh_tokens_bool_exp"] | undefined | null;
  };
  /** Ordering options when selecting data from "refresh_tokens". */
  ["refresh_tokens_order_by"]: {
    access_code?:
      | ResolverInputTypes["access_codes_order_by"]
      | undefined
      | null;
    auth_code?: ResolverInputTypes["order_by"] | undefined | null;
    token_hash?: ResolverInputTypes["order_by"] | undefined | null;
  };
  /** primary key columns input for table: refresh_tokens */
  ["refresh_tokens_pk_columns_input"]: {
    token_hash: string;
  };
  /** select columns of table "refresh_tokens" */
  ["refresh_tokens_select_column"]: refresh_tokens_select_column;
  /** input type for updating data in table "refresh_tokens" */
  ["refresh_tokens_set_input"]: {
    auth_code?: ResolverInputTypes["uuid"] | undefined | null;
    token_hash?: string | undefined | null;
  };
  /** Streaming cursor of the table "refresh_tokens" */
  ["refresh_tokens_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ResolverInputTypes["refresh_tokens_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null;
  };
  /** Initial value of the column from where the streaming should start */
  ["refresh_tokens_stream_cursor_value_input"]: {
    auth_code?: ResolverInputTypes["uuid"] | undefined | null;
    token_hash?: string | undefined | null;
  };
  /** update columns of table "refresh_tokens" */
  ["refresh_tokens_update_column"]: refresh_tokens_update_column;
  ["refresh_tokens_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: ResolverInputTypes["refresh_tokens_set_input"] | undefined | null;
    /** filter the rows which have to be updated */
    where: ResolverInputTypes["refresh_tokens_bool_exp"];
  };
  /** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
  ["String_array_comparison_exp"]: {
    /** is the array contained in the given array value */
    _contained_in?: Array<string> | undefined | null;
    /** does the array contain the given value */
    _contains?: Array<string> | undefined | null;
    _eq?: Array<string> | undefined | null;
    _gt?: Array<string> | undefined | null;
    _gte?: Array<string> | undefined | null;
    _in?: Array<Array<string> | undefined | null>;
    _is_null?: boolean | undefined | null;
    _lt?: Array<string> | undefined | null;
    _lte?: Array<string> | undefined | null;
    _neq?: Array<string> | undefined | null;
    _nin?: Array<Array<string> | undefined | null>;
  };
  /** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
  ["String_comparison_exp"]: {
    _eq?: string | undefined | null;
    _gt?: string | undefined | null;
    _gte?: string | undefined | null;
    /** does the column match the given case-insensitive pattern */
    _ilike?: string | undefined | null;
    _in?: Array<string> | undefined | null;
    /** does the column match the given POSIX regular expression, case insensitive */
    _iregex?: string | undefined | null;
    _is_null?: boolean | undefined | null;
    /** does the column match the given pattern */
    _like?: string | undefined | null;
    _lt?: string | undefined | null;
    _lte?: string | undefined | null;
    _neq?: string | undefined | null;
    /** does the column NOT match the given case-insensitive pattern */
    _nilike?: string | undefined | null;
    _nin?: Array<string> | undefined | null;
    /** does the column NOT match the given POSIX regular expression, case insensitive */
    _niregex?: string | undefined | null;
    /** does the column NOT match the given pattern */
    _nlike?: string | undefined | null;
    /** does the column NOT match the given POSIX regular expression, case sensitive */
    _nregex?: string | undefined | null;
    /** does the column NOT match the given SQL regular expression */
    _nsimilar?: string | undefined | null;
    /** does the column match the given POSIX regular expression, case sensitive */
    _regex?: string | undefined | null;
    /** does the column match the given SQL regular expression */
    _similar?: string | undefined | null;
  };
  ["subscription_root"]: AliasType<{
    access_codes?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_codes_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_codes_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_codes_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_codes"],
    ];
    access_codes_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_codes_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_codes_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_codes_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_codes_aggregate"],
    ];
    access_codes_by_pk?: [
      { id: ResolverInputTypes["uuid"] },
      ResolverInputTypes["access_codes"],
    ];
    access_codes_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size: number /** cursor to stream the results returned by the query */;
        cursor: Array<
          | ResolverInputTypes["access_codes_stream_cursor_input"]
          | undefined
          | null
        > /** filter the rows returned */;
        where?: ResolverInputTypes["access_codes_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_codes"],
    ];
    access_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_tokens"],
    ];
    access_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["access_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["access_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_tokens_aggregate"],
    ];
    access_tokens_by_pk?: [
      { jti: string },
      ResolverInputTypes["access_tokens"],
    ];
    access_tokens_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size: number /** cursor to stream the results returned by the query */;
        cursor: Array<
          | ResolverInputTypes["access_tokens_stream_cursor_input"]
          | undefined
          | null
        > /** filter the rows returned */;
        where?: ResolverInputTypes["access_tokens_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["access_tokens"],
    ];
    burgers?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["burgers_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["burgers_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["burgers_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["burgers"],
    ];
    burgers_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["burgers_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["burgers_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["burgers_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["burgers_aggregate"],
    ];
    burgers_by_pk?: [{ user_id: string }, ResolverInputTypes["burgers"]];
    burgers_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size: number /** cursor to stream the results returned by the query */;
        cursor: Array<
          ResolverInputTypes["burgers_stream_cursor_input"] | undefined | null
        > /** filter the rows returned */;
        where?: ResolverInputTypes["burgers_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["burgers"],
    ];
    clients?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["clients_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["clients_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["clients_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["clients"],
    ];
    clients_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["clients_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["clients_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?: ResolverInputTypes["clients_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["clients_aggregate"],
    ];
    clients_by_pk?: [
      { id: ResolverInputTypes["uuid"] },
      ResolverInputTypes["clients"],
    ];
    clients_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size: number /** cursor to stream the results returned by the query */;
        cursor: Array<
          ResolverInputTypes["clients_stream_cursor_input"] | undefined | null
        > /** filter the rows returned */;
        where?: ResolverInputTypes["clients_bool_exp"] | undefined | null;
      },
      ResolverInputTypes["clients"],
    ];
    refresh_tokens?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["refresh_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["refresh_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?:
          | ResolverInputTypes["refresh_tokens_bool_exp"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens"],
    ];
    refresh_tokens_aggregate?: [
      {
        /** distinct select on columns */
        distinct_on?:
          | Array<ResolverInputTypes["refresh_tokens_select_column"]>
          | undefined
          | null /** limit the number of rows returned */;
        limit?:
          | number
          | undefined
          | null /** skip the first n rows. Use only with order_by */;
        offset?:
          | number
          | undefined
          | null /** sort the rows by one or more columns */;
        order_by?:
          | Array<ResolverInputTypes["refresh_tokens_order_by"]>
          | undefined
          | null /** filter the rows returned */;
        where?:
          | ResolverInputTypes["refresh_tokens_bool_exp"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens_aggregate"],
    ];
    refresh_tokens_by_pk?: [
      { token_hash: string },
      ResolverInputTypes["refresh_tokens"],
    ];
    refresh_tokens_stream?: [
      {
        /** maximum number of rows returned in a single batch */
        batch_size: number /** cursor to stream the results returned by the query */;
        cursor: Array<
          | ResolverInputTypes["refresh_tokens_stream_cursor_input"]
          | undefined
          | null
        > /** filter the rows returned */;
        where?:
          | ResolverInputTypes["refresh_tokens_bool_exp"]
          | undefined
          | null;
      },
      ResolverInputTypes["refresh_tokens"],
    ];
    __typename?: boolean | `@${string}`;
  }>;
  ["uuid"]: unknown;
  /** Boolean expression to compare columns of type "uuid". All fields are combined with logical 'AND'. */
  ["uuid_comparison_exp"]: {
    _eq?: ResolverInputTypes["uuid"] | undefined | null;
    _gt?: ResolverInputTypes["uuid"] | undefined | null;
    _gte?: ResolverInputTypes["uuid"] | undefined | null;
    _in?: Array<ResolverInputTypes["uuid"]> | undefined | null;
    _is_null?: boolean | undefined | null;
    _lt?: ResolverInputTypes["uuid"] | undefined | null;
    _lte?: ResolverInputTypes["uuid"] | undefined | null;
    _neq?: ResolverInputTypes["uuid"] | undefined | null;
    _nin?: Array<ResolverInputTypes["uuid"]> | undefined | null;
  };
};

export type ModelTypes = {
  ["schema"]: {
    query?: ModelTypes["query_root"] | undefined;
    mutation?: ModelTypes["mutation_root"] | undefined;
    subscription?: ModelTypes["subscription_root"] | undefined;
  };
  /** OAuth 2.0 access code grants. */
  ["access_codes"]: {
    /** An array relationship */
    access_tokens: Array<ModelTypes["access_tokens"]>;
    /** An aggregate relationship */
    access_tokens_aggregate: ModelTypes["access_tokens_aggregate"];
    client: ModelTypes["uuid"];
    /** An object relationship */
    clients?: ModelTypes["clients"] | undefined;
    code: ModelTypes["uuid"];
    id: ModelTypes["uuid"];
    /** An array relationship */
    refresh_tokens: Array<ModelTypes["refresh_tokens"]>;
    /** An aggregate relationship */
    refresh_tokens_aggregate: ModelTypes["refresh_tokens_aggregate"];
    scope: Array<string>;
    used: boolean;
    user_id: string;
  };
  /** aggregated selection of "access_codes" */
  ["access_codes_aggregate"]: {
    aggregate?: ModelTypes["access_codes_aggregate_fields"] | undefined;
    nodes: Array<ModelTypes["access_codes"]>;
  };
  /** aggregate fields of "access_codes" */
  ["access_codes_aggregate_fields"]: {
    count: number;
    max?: ModelTypes["access_codes_max_fields"] | undefined;
    min?: ModelTypes["access_codes_min_fields"] | undefined;
  };
  /** Boolean expression to filter rows from the table "access_codes". All fields are combined with a logical 'AND'. */
  ["access_codes_bool_exp"]: {
    _and?: Array<ModelTypes["access_codes_bool_exp"]> | undefined;
    _not?: ModelTypes["access_codes_bool_exp"] | undefined;
    _or?: Array<ModelTypes["access_codes_bool_exp"]> | undefined;
    access_tokens?: ModelTypes["access_tokens_bool_exp"] | undefined;
    access_tokens_aggregate?:
      | ModelTypes["access_tokens_aggregate_bool_exp"]
      | undefined;
    client?: ModelTypes["uuid_comparison_exp"] | undefined;
    clients?: ModelTypes["clients_bool_exp"] | undefined;
    code?: ModelTypes["uuid_comparison_exp"] | undefined;
    id?: ModelTypes["uuid_comparison_exp"] | undefined;
    refresh_tokens?: ModelTypes["refresh_tokens_bool_exp"] | undefined;
    refresh_tokens_aggregate?:
      | ModelTypes["refresh_tokens_aggregate_bool_exp"]
      | undefined;
    scope?: ModelTypes["String_array_comparison_exp"] | undefined;
    used?: ModelTypes["Boolean_comparison_exp"] | undefined;
    user_id?: ModelTypes["String_comparison_exp"] | undefined;
  };
  ["access_codes_constraint"]: access_codes_constraint;
  /** input type for inserting data into table "access_codes" */
  ["access_codes_insert_input"]: {
    access_tokens?:
      | ModelTypes["access_tokens_arr_rel_insert_input"]
      | undefined;
    client?: ModelTypes["uuid"] | undefined;
    clients?: ModelTypes["clients_obj_rel_insert_input"] | undefined;
    code?: ModelTypes["uuid"] | undefined;
    id?: ModelTypes["uuid"] | undefined;
    refresh_tokens?:
      | ModelTypes["refresh_tokens_arr_rel_insert_input"]
      | undefined;
    scope?: Array<string> | undefined;
    used?: boolean | undefined;
    user_id?: string | undefined;
  };
  /** aggregate max on columns */
  ["access_codes_max_fields"]: {
    client?: ModelTypes["uuid"] | undefined;
    code?: ModelTypes["uuid"] | undefined;
    id?: ModelTypes["uuid"] | undefined;
    scope?: Array<string> | undefined;
    user_id?: string | undefined;
  };
  /** aggregate min on columns */
  ["access_codes_min_fields"]: {
    client?: ModelTypes["uuid"] | undefined;
    code?: ModelTypes["uuid"] | undefined;
    id?: ModelTypes["uuid"] | undefined;
    scope?: Array<string> | undefined;
    user_id?: string | undefined;
  };
  /** response of any mutation on the table "access_codes" */
  ["access_codes_mutation_response"]: {
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<ModelTypes["access_codes"]>;
  };
  /** input type for inserting object relation for remote table "access_codes" */
  ["access_codes_obj_rel_insert_input"]: {
    data: ModelTypes["access_codes_insert_input"];
    /** upsert condition */
    on_conflict?: ModelTypes["access_codes_on_conflict"] | undefined;
  };
  /** on_conflict condition type for table "access_codes" */
  ["access_codes_on_conflict"]: {
    constraint: ModelTypes["access_codes_constraint"];
    update_columns: Array<ModelTypes["access_codes_update_column"]>;
    where?: ModelTypes["access_codes_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "access_codes". */
  ["access_codes_order_by"]: {
    access_tokens_aggregate?:
      | ModelTypes["access_tokens_aggregate_order_by"]
      | undefined;
    client?: ModelTypes["order_by"] | undefined;
    clients?: ModelTypes["clients_order_by"] | undefined;
    code?: ModelTypes["order_by"] | undefined;
    id?: ModelTypes["order_by"] | undefined;
    refresh_tokens_aggregate?:
      | ModelTypes["refresh_tokens_aggregate_order_by"]
      | undefined;
    scope?: ModelTypes["order_by"] | undefined;
    used?: ModelTypes["order_by"] | undefined;
    user_id?: ModelTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: access_codes */
  ["access_codes_pk_columns_input"]: {
    id: ModelTypes["uuid"];
  };
  ["access_codes_select_column"]: access_codes_select_column;
  /** input type for updating data in table "access_codes" */
  ["access_codes_set_input"]: {
    client?: ModelTypes["uuid"] | undefined;
    code?: ModelTypes["uuid"] | undefined;
    id?: ModelTypes["uuid"] | undefined;
    scope?: Array<string> | undefined;
    used?: boolean | undefined;
    user_id?: string | undefined;
  };
  /** Streaming cursor of the table "access_codes" */
  ["access_codes_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ModelTypes["access_codes_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ModelTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["access_codes_stream_cursor_value_input"]: {
    client?: ModelTypes["uuid"] | undefined;
    code?: ModelTypes["uuid"] | undefined;
    id?: ModelTypes["uuid"] | undefined;
    scope?: Array<string> | undefined;
    used?: boolean | undefined;
    user_id?: string | undefined;
  };
  ["access_codes_update_column"]: access_codes_update_column;
  ["access_codes_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: ModelTypes["access_codes_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: ModelTypes["access_codes_bool_exp"];
  };
  /** Minted OAuth 2.0 access tokens. Used to track revocations in the event of an access code replay. */
  ["access_tokens"]: {
    access_code: ModelTypes["uuid"];
    jti: string;
  };
  /** aggregated selection of "access_tokens" */
  ["access_tokens_aggregate"]: {
    aggregate?: ModelTypes["access_tokens_aggregate_fields"] | undefined;
    nodes: Array<ModelTypes["access_tokens"]>;
  };
  ["access_tokens_aggregate_bool_exp"]: {
    count?: ModelTypes["access_tokens_aggregate_bool_exp_count"] | undefined;
  };
  ["access_tokens_aggregate_bool_exp_count"]: {
    arguments?: Array<ModelTypes["access_tokens_select_column"]> | undefined;
    distinct?: boolean | undefined;
    filter?: ModelTypes["access_tokens_bool_exp"] | undefined;
    predicate: ModelTypes["Int_comparison_exp"];
  };
  /** aggregate fields of "access_tokens" */
  ["access_tokens_aggregate_fields"]: {
    count: number;
    max?: ModelTypes["access_tokens_max_fields"] | undefined;
    min?: ModelTypes["access_tokens_min_fields"] | undefined;
  };
  /** order by aggregate values of table "access_tokens" */
  ["access_tokens_aggregate_order_by"]: {
    count?: ModelTypes["order_by"] | undefined;
    max?: ModelTypes["access_tokens_max_order_by"] | undefined;
    min?: ModelTypes["access_tokens_min_order_by"] | undefined;
  };
  /** input type for inserting array relation for remote table "access_tokens" */
  ["access_tokens_arr_rel_insert_input"]: {
    data: Array<ModelTypes["access_tokens_insert_input"]>;
    /** upsert condition */
    on_conflict?: ModelTypes["access_tokens_on_conflict"] | undefined;
  };
  /** Boolean expression to filter rows from the table "access_tokens". All fields are combined with a logical 'AND'. */
  ["access_tokens_bool_exp"]: {
    _and?: Array<ModelTypes["access_tokens_bool_exp"]> | undefined;
    _not?: ModelTypes["access_tokens_bool_exp"] | undefined;
    _or?: Array<ModelTypes["access_tokens_bool_exp"]> | undefined;
    access_code?: ModelTypes["uuid_comparison_exp"] | undefined;
    jti?: ModelTypes["String_comparison_exp"] | undefined;
  };
  ["access_tokens_constraint"]: access_tokens_constraint;
  /** input type for inserting data into table "access_tokens" */
  ["access_tokens_insert_input"]: {
    access_code?: ModelTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** aggregate max on columns */
  ["access_tokens_max_fields"]: {
    access_code?: ModelTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** order by max() on columns of table "access_tokens" */
  ["access_tokens_max_order_by"]: {
    access_code?: ModelTypes["order_by"] | undefined;
    jti?: ModelTypes["order_by"] | undefined;
  };
  /** aggregate min on columns */
  ["access_tokens_min_fields"]: {
    access_code?: ModelTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** order by min() on columns of table "access_tokens" */
  ["access_tokens_min_order_by"]: {
    access_code?: ModelTypes["order_by"] | undefined;
    jti?: ModelTypes["order_by"] | undefined;
  };
  /** response of any mutation on the table "access_tokens" */
  ["access_tokens_mutation_response"]: {
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<ModelTypes["access_tokens"]>;
  };
  /** on_conflict condition type for table "access_tokens" */
  ["access_tokens_on_conflict"]: {
    constraint: ModelTypes["access_tokens_constraint"];
    update_columns: Array<ModelTypes["access_tokens_update_column"]>;
    where?: ModelTypes["access_tokens_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "access_tokens". */
  ["access_tokens_order_by"]: {
    access_code?: ModelTypes["order_by"] | undefined;
    jti?: ModelTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: access_tokens */
  ["access_tokens_pk_columns_input"]: {
    jti: string;
  };
  ["access_tokens_select_column"]: access_tokens_select_column;
  /** input type for updating data in table "access_tokens" */
  ["access_tokens_set_input"]: {
    access_code?: ModelTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** Streaming cursor of the table "access_tokens" */
  ["access_tokens_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ModelTypes["access_tokens_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ModelTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["access_tokens_stream_cursor_value_input"]: {
    access_code?: ModelTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  ["access_tokens_update_column"]: access_tokens_update_column;
  ["access_tokens_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: ModelTypes["access_tokens_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: ModelTypes["access_tokens_bool_exp"];
  };
  /** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
  ["Boolean_comparison_exp"]: {
    _eq?: boolean | undefined;
    _gt?: boolean | undefined;
    _gte?: boolean | undefined;
    _in?: Array<boolean> | undefined;
    _is_null?: boolean | undefined;
    _lt?: boolean | undefined;
    _lte?: boolean | undefined;
    _neq?: boolean | undefined;
    _nin?: Array<boolean> | undefined;
  };
  /** Burger counts for users. */
  ["burgers"]: {
    count: number;
    user_id: string;
  };
  /** aggregated selection of "burgers" */
  ["burgers_aggregate"]: {
    aggregate?: ModelTypes["burgers_aggregate_fields"] | undefined;
    nodes: Array<ModelTypes["burgers"]>;
  };
  /** aggregate fields of "burgers" */
  ["burgers_aggregate_fields"]: {
    avg?: ModelTypes["burgers_avg_fields"] | undefined;
    count: number;
    max?: ModelTypes["burgers_max_fields"] | undefined;
    min?: ModelTypes["burgers_min_fields"] | undefined;
    stddev?: ModelTypes["burgers_stddev_fields"] | undefined;
    stddev_pop?: ModelTypes["burgers_stddev_pop_fields"] | undefined;
    stddev_samp?: ModelTypes["burgers_stddev_samp_fields"] | undefined;
    sum?: ModelTypes["burgers_sum_fields"] | undefined;
    var_pop?: ModelTypes["burgers_var_pop_fields"] | undefined;
    var_samp?: ModelTypes["burgers_var_samp_fields"] | undefined;
    variance?: ModelTypes["burgers_variance_fields"] | undefined;
  };
  /** aggregate avg on columns */
  ["burgers_avg_fields"]: {
    count?: number | undefined;
  };
  /** Boolean expression to filter rows from the table "burgers". All fields are combined with a logical 'AND'. */
  ["burgers_bool_exp"]: {
    _and?: Array<ModelTypes["burgers_bool_exp"]> | undefined;
    _not?: ModelTypes["burgers_bool_exp"] | undefined;
    _or?: Array<ModelTypes["burgers_bool_exp"]> | undefined;
    count?: ModelTypes["Int_comparison_exp"] | undefined;
    user_id?: ModelTypes["String_comparison_exp"] | undefined;
  };
  ["burgers_constraint"]: burgers_constraint;
  /** input type for incrementing numeric columns in table "burgers" */
  ["burgers_inc_input"]: {
    count?: number | undefined;
  };
  /** input type for inserting data into table "burgers" */
  ["burgers_insert_input"]: {
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** aggregate max on columns */
  ["burgers_max_fields"]: {
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** aggregate min on columns */
  ["burgers_min_fields"]: {
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** response of any mutation on the table "burgers" */
  ["burgers_mutation_response"]: {
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<ModelTypes["burgers"]>;
  };
  /** on_conflict condition type for table "burgers" */
  ["burgers_on_conflict"]: {
    constraint: ModelTypes["burgers_constraint"];
    update_columns: Array<ModelTypes["burgers_update_column"]>;
    where?: ModelTypes["burgers_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "burgers". */
  ["burgers_order_by"]: {
    count?: ModelTypes["order_by"] | undefined;
    user_id?: ModelTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: burgers */
  ["burgers_pk_columns_input"]: {
    user_id: string;
  };
  ["burgers_select_column"]: burgers_select_column;
  /** input type for updating data in table "burgers" */
  ["burgers_set_input"]: {
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** aggregate stddev on columns */
  ["burgers_stddev_fields"]: {
    count?: number | undefined;
  };
  /** aggregate stddev_pop on columns */
  ["burgers_stddev_pop_fields"]: {
    count?: number | undefined;
  };
  /** aggregate stddev_samp on columns */
  ["burgers_stddev_samp_fields"]: {
    count?: number | undefined;
  };
  /** Streaming cursor of the table "burgers" */
  ["burgers_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ModelTypes["burgers_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ModelTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["burgers_stream_cursor_value_input"]: {
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** aggregate sum on columns */
  ["burgers_sum_fields"]: {
    count?: number | undefined;
  };
  ["burgers_update_column"]: burgers_update_column;
  ["burgers_updates"]: {
    /** increments the numeric columns with given value of the filtered values */
    _inc?: ModelTypes["burgers_inc_input"] | undefined;
    /** sets the columns of the filtered rows to the given values */
    _set?: ModelTypes["burgers_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: ModelTypes["burgers_bool_exp"];
  };
  /** aggregate var_pop on columns */
  ["burgers_var_pop_fields"]: {
    count?: number | undefined;
  };
  /** aggregate var_samp on columns */
  ["burgers_var_samp_fields"]: {
    count?: number | undefined;
  };
  /** aggregate variance on columns */
  ["burgers_variance_fields"]: {
    count?: number | undefined;
  };
  /** Registered OAuth 2.0 clients. */
  ["clients"]: {
    client_id: string;
    client_secret_hash: string;
    id: ModelTypes["uuid"];
    name: string;
    redirect_uri: string;
  };
  /** aggregated selection of "clients" */
  ["clients_aggregate"]: {
    aggregate?: ModelTypes["clients_aggregate_fields"] | undefined;
    nodes: Array<ModelTypes["clients"]>;
  };
  /** aggregate fields of "clients" */
  ["clients_aggregate_fields"]: {
    count: number;
    max?: ModelTypes["clients_max_fields"] | undefined;
    min?: ModelTypes["clients_min_fields"] | undefined;
  };
  /** Boolean expression to filter rows from the table "clients". All fields are combined with a logical 'AND'. */
  ["clients_bool_exp"]: {
    _and?: Array<ModelTypes["clients_bool_exp"]> | undefined;
    _not?: ModelTypes["clients_bool_exp"] | undefined;
    _or?: Array<ModelTypes["clients_bool_exp"]> | undefined;
    client_id?: ModelTypes["String_comparison_exp"] | undefined;
    client_secret_hash?: ModelTypes["String_comparison_exp"] | undefined;
    id?: ModelTypes["uuid_comparison_exp"] | undefined;
    name?: ModelTypes["String_comparison_exp"] | undefined;
    redirect_uri?: ModelTypes["String_comparison_exp"] | undefined;
  };
  ["clients_constraint"]: clients_constraint;
  /** input type for inserting data into table "clients" */
  ["clients_insert_input"]: {
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: ModelTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** aggregate max on columns */
  ["clients_max_fields"]: {
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: ModelTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** aggregate min on columns */
  ["clients_min_fields"]: {
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: ModelTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** response of any mutation on the table "clients" */
  ["clients_mutation_response"]: {
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<ModelTypes["clients"]>;
  };
  /** input type for inserting object relation for remote table "clients" */
  ["clients_obj_rel_insert_input"]: {
    data: ModelTypes["clients_insert_input"];
    /** upsert condition */
    on_conflict?: ModelTypes["clients_on_conflict"] | undefined;
  };
  /** on_conflict condition type for table "clients" */
  ["clients_on_conflict"]: {
    constraint: ModelTypes["clients_constraint"];
    update_columns: Array<ModelTypes["clients_update_column"]>;
    where?: ModelTypes["clients_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "clients". */
  ["clients_order_by"]: {
    client_id?: ModelTypes["order_by"] | undefined;
    client_secret_hash?: ModelTypes["order_by"] | undefined;
    id?: ModelTypes["order_by"] | undefined;
    name?: ModelTypes["order_by"] | undefined;
    redirect_uri?: ModelTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: clients */
  ["clients_pk_columns_input"]: {
    id: ModelTypes["uuid"];
  };
  ["clients_select_column"]: clients_select_column;
  /** input type for updating data in table "clients" */
  ["clients_set_input"]: {
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: ModelTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** Streaming cursor of the table "clients" */
  ["clients_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ModelTypes["clients_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ModelTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["clients_stream_cursor_value_input"]: {
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: ModelTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  ["clients_update_column"]: clients_update_column;
  ["clients_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: ModelTypes["clients_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: ModelTypes["clients_bool_exp"];
  };
  ["cursor_ordering"]: cursor_ordering;
  /** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
  ["Int_comparison_exp"]: {
    _eq?: number | undefined;
    _gt?: number | undefined;
    _gte?: number | undefined;
    _in?: Array<number> | undefined;
    _is_null?: boolean | undefined;
    _lt?: number | undefined;
    _lte?: number | undefined;
    _neq?: number | undefined;
    _nin?: Array<number> | undefined;
  };
  /** mutation root */
  ["mutation_root"]: {
    /** delete data from the table: "access_codes" */
    delete_access_codes?:
      | ModelTypes["access_codes_mutation_response"]
      | undefined;
    /** delete single row from the table: "access_codes" */
    delete_access_codes_by_pk?: ModelTypes["access_codes"] | undefined;
    /** delete data from the table: "access_tokens" */
    delete_access_tokens?:
      | ModelTypes["access_tokens_mutation_response"]
      | undefined;
    /** delete single row from the table: "access_tokens" */
    delete_access_tokens_by_pk?: ModelTypes["access_tokens"] | undefined;
    /** delete data from the table: "burgers" */
    delete_burgers?: ModelTypes["burgers_mutation_response"] | undefined;
    /** delete single row from the table: "burgers" */
    delete_burgers_by_pk?: ModelTypes["burgers"] | undefined;
    /** delete data from the table: "clients" */
    delete_clients?: ModelTypes["clients_mutation_response"] | undefined;
    /** delete single row from the table: "clients" */
    delete_clients_by_pk?: ModelTypes["clients"] | undefined;
    /** delete data from the table: "refresh_tokens" */
    delete_refresh_tokens?:
      | ModelTypes["refresh_tokens_mutation_response"]
      | undefined;
    /** delete single row from the table: "refresh_tokens" */
    delete_refresh_tokens_by_pk?: ModelTypes["refresh_tokens"] | undefined;
    /** insert data into the table: "access_codes" */
    insert_access_codes?:
      | ModelTypes["access_codes_mutation_response"]
      | undefined;
    /** insert a single row into the table: "access_codes" */
    insert_access_codes_one?: ModelTypes["access_codes"] | undefined;
    /** insert data into the table: "access_tokens" */
    insert_access_tokens?:
      | ModelTypes["access_tokens_mutation_response"]
      | undefined;
    /** insert a single row into the table: "access_tokens" */
    insert_access_tokens_one?: ModelTypes["access_tokens"] | undefined;
    /** insert data into the table: "burgers" */
    insert_burgers?: ModelTypes["burgers_mutation_response"] | undefined;
    /** insert a single row into the table: "burgers" */
    insert_burgers_one?: ModelTypes["burgers"] | undefined;
    /** insert data into the table: "clients" */
    insert_clients?: ModelTypes["clients_mutation_response"] | undefined;
    /** insert a single row into the table: "clients" */
    insert_clients_one?: ModelTypes["clients"] | undefined;
    /** insert data into the table: "refresh_tokens" */
    insert_refresh_tokens?:
      | ModelTypes["refresh_tokens_mutation_response"]
      | undefined;
    /** insert a single row into the table: "refresh_tokens" */
    insert_refresh_tokens_one?: ModelTypes["refresh_tokens"] | undefined;
    /** update data of the table: "access_codes" */
    update_access_codes?:
      | ModelTypes["access_codes_mutation_response"]
      | undefined;
    /** update single row of the table: "access_codes" */
    update_access_codes_by_pk?: ModelTypes["access_codes"] | undefined;
    /** update multiples rows of table: "access_codes" */
    update_access_codes_many?:
      | Array<ModelTypes["access_codes_mutation_response"] | undefined>
      | undefined;
    /** update data of the table: "access_tokens" */
    update_access_tokens?:
      | ModelTypes["access_tokens_mutation_response"]
      | undefined;
    /** update single row of the table: "access_tokens" */
    update_access_tokens_by_pk?: ModelTypes["access_tokens"] | undefined;
    /** update multiples rows of table: "access_tokens" */
    update_access_tokens_many?:
      | Array<ModelTypes["access_tokens_mutation_response"] | undefined>
      | undefined;
    /** update data of the table: "burgers" */
    update_burgers?: ModelTypes["burgers_mutation_response"] | undefined;
    /** update single row of the table: "burgers" */
    update_burgers_by_pk?: ModelTypes["burgers"] | undefined;
    /** update multiples rows of table: "burgers" */
    update_burgers_many?:
      | Array<ModelTypes["burgers_mutation_response"] | undefined>
      | undefined;
    /** update data of the table: "clients" */
    update_clients?: ModelTypes["clients_mutation_response"] | undefined;
    /** update single row of the table: "clients" */
    update_clients_by_pk?: ModelTypes["clients"] | undefined;
    /** update multiples rows of table: "clients" */
    update_clients_many?:
      | Array<ModelTypes["clients_mutation_response"] | undefined>
      | undefined;
    /** update data of the table: "refresh_tokens" */
    update_refresh_tokens?:
      | ModelTypes["refresh_tokens_mutation_response"]
      | undefined;
    /** update single row of the table: "refresh_tokens" */
    update_refresh_tokens_by_pk?: ModelTypes["refresh_tokens"] | undefined;
    /** update multiples rows of table: "refresh_tokens" */
    update_refresh_tokens_many?:
      | Array<ModelTypes["refresh_tokens_mutation_response"] | undefined>
      | undefined;
  };
  ["order_by"]: order_by;
  ["query_root"]: {
    /** fetch data from the table: "access_codes" */
    access_codes: Array<ModelTypes["access_codes"]>;
    /** fetch aggregated fields from the table: "access_codes" */
    access_codes_aggregate: ModelTypes["access_codes_aggregate"];
    /** fetch data from the table: "access_codes" using primary key columns */
    access_codes_by_pk?: ModelTypes["access_codes"] | undefined;
    /** An array relationship */
    access_tokens: Array<ModelTypes["access_tokens"]>;
    /** An aggregate relationship */
    access_tokens_aggregate: ModelTypes["access_tokens_aggregate"];
    /** fetch data from the table: "access_tokens" using primary key columns */
    access_tokens_by_pk?: ModelTypes["access_tokens"] | undefined;
    /** fetch data from the table: "burgers" */
    burgers: Array<ModelTypes["burgers"]>;
    /** fetch aggregated fields from the table: "burgers" */
    burgers_aggregate: ModelTypes["burgers_aggregate"];
    /** fetch data from the table: "burgers" using primary key columns */
    burgers_by_pk?: ModelTypes["burgers"] | undefined;
    /** fetch data from the table: "clients" */
    clients: Array<ModelTypes["clients"]>;
    /** fetch aggregated fields from the table: "clients" */
    clients_aggregate: ModelTypes["clients_aggregate"];
    /** fetch data from the table: "clients" using primary key columns */
    clients_by_pk?: ModelTypes["clients"] | undefined;
    /** An array relationship */
    refresh_tokens: Array<ModelTypes["refresh_tokens"]>;
    /** An aggregate relationship */
    refresh_tokens_aggregate: ModelTypes["refresh_tokens_aggregate"];
    /** fetch data from the table: "refresh_tokens" using primary key columns */
    refresh_tokens_by_pk?: ModelTypes["refresh_tokens"] | undefined;
  };
  /** OAuth 2.0 refresh tokens associated with auth codes. */
  ["refresh_tokens"]: {
    /** An object relationship */
    access_code: ModelTypes["access_codes"];
    auth_code: ModelTypes["uuid"];
    token_hash: string;
  };
  /** aggregated selection of "refresh_tokens" */
  ["refresh_tokens_aggregate"]: {
    aggregate?: ModelTypes["refresh_tokens_aggregate_fields"] | undefined;
    nodes: Array<ModelTypes["refresh_tokens"]>;
  };
  ["refresh_tokens_aggregate_bool_exp"]: {
    count?: ModelTypes["refresh_tokens_aggregate_bool_exp_count"] | undefined;
  };
  ["refresh_tokens_aggregate_bool_exp_count"]: {
    arguments?: Array<ModelTypes["refresh_tokens_select_column"]> | undefined;
    distinct?: boolean | undefined;
    filter?: ModelTypes["refresh_tokens_bool_exp"] | undefined;
    predicate: ModelTypes["Int_comparison_exp"];
  };
  /** aggregate fields of "refresh_tokens" */
  ["refresh_tokens_aggregate_fields"]: {
    count: number;
    max?: ModelTypes["refresh_tokens_max_fields"] | undefined;
    min?: ModelTypes["refresh_tokens_min_fields"] | undefined;
  };
  /** order by aggregate values of table "refresh_tokens" */
  ["refresh_tokens_aggregate_order_by"]: {
    count?: ModelTypes["order_by"] | undefined;
    max?: ModelTypes["refresh_tokens_max_order_by"] | undefined;
    min?: ModelTypes["refresh_tokens_min_order_by"] | undefined;
  };
  /** input type for inserting array relation for remote table "refresh_tokens" */
  ["refresh_tokens_arr_rel_insert_input"]: {
    data: Array<ModelTypes["refresh_tokens_insert_input"]>;
    /** upsert condition */
    on_conflict?: ModelTypes["refresh_tokens_on_conflict"] | undefined;
  };
  /** Boolean expression to filter rows from the table "refresh_tokens". All fields are combined with a logical 'AND'. */
  ["refresh_tokens_bool_exp"]: {
    _and?: Array<ModelTypes["refresh_tokens_bool_exp"]> | undefined;
    _not?: ModelTypes["refresh_tokens_bool_exp"] | undefined;
    _or?: Array<ModelTypes["refresh_tokens_bool_exp"]> | undefined;
    access_code?: ModelTypes["access_codes_bool_exp"] | undefined;
    auth_code?: ModelTypes["uuid_comparison_exp"] | undefined;
    token_hash?: ModelTypes["String_comparison_exp"] | undefined;
  };
  ["refresh_tokens_constraint"]: refresh_tokens_constraint;
  /** input type for inserting data into table "refresh_tokens" */
  ["refresh_tokens_insert_input"]: {
    access_code?: ModelTypes["access_codes_obj_rel_insert_input"] | undefined;
    auth_code?: ModelTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** aggregate max on columns */
  ["refresh_tokens_max_fields"]: {
    auth_code?: ModelTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** order by max() on columns of table "refresh_tokens" */
  ["refresh_tokens_max_order_by"]: {
    auth_code?: ModelTypes["order_by"] | undefined;
    token_hash?: ModelTypes["order_by"] | undefined;
  };
  /** aggregate min on columns */
  ["refresh_tokens_min_fields"]: {
    auth_code?: ModelTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** order by min() on columns of table "refresh_tokens" */
  ["refresh_tokens_min_order_by"]: {
    auth_code?: ModelTypes["order_by"] | undefined;
    token_hash?: ModelTypes["order_by"] | undefined;
  };
  /** response of any mutation on the table "refresh_tokens" */
  ["refresh_tokens_mutation_response"]: {
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<ModelTypes["refresh_tokens"]>;
  };
  /** on_conflict condition type for table "refresh_tokens" */
  ["refresh_tokens_on_conflict"]: {
    constraint: ModelTypes["refresh_tokens_constraint"];
    update_columns: Array<ModelTypes["refresh_tokens_update_column"]>;
    where?: ModelTypes["refresh_tokens_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "refresh_tokens". */
  ["refresh_tokens_order_by"]: {
    access_code?: ModelTypes["access_codes_order_by"] | undefined;
    auth_code?: ModelTypes["order_by"] | undefined;
    token_hash?: ModelTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: refresh_tokens */
  ["refresh_tokens_pk_columns_input"]: {
    token_hash: string;
  };
  ["refresh_tokens_select_column"]: refresh_tokens_select_column;
  /** input type for updating data in table "refresh_tokens" */
  ["refresh_tokens_set_input"]: {
    auth_code?: ModelTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** Streaming cursor of the table "refresh_tokens" */
  ["refresh_tokens_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: ModelTypes["refresh_tokens_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: ModelTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["refresh_tokens_stream_cursor_value_input"]: {
    auth_code?: ModelTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  ["refresh_tokens_update_column"]: refresh_tokens_update_column;
  ["refresh_tokens_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: ModelTypes["refresh_tokens_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: ModelTypes["refresh_tokens_bool_exp"];
  };
  /** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
  ["String_array_comparison_exp"]: {
    /** is the array contained in the given array value */
    _contained_in?: Array<string> | undefined;
    /** does the array contain the given value */
    _contains?: Array<string> | undefined;
    _eq?: Array<string> | undefined;
    _gt?: Array<string> | undefined;
    _gte?: Array<string> | undefined;
    _in?: Array<Array<string> | undefined>;
    _is_null?: boolean | undefined;
    _lt?: Array<string> | undefined;
    _lte?: Array<string> | undefined;
    _neq?: Array<string> | undefined;
    _nin?: Array<Array<string> | undefined>;
  };
  /** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
  ["String_comparison_exp"]: {
    _eq?: string | undefined;
    _gt?: string | undefined;
    _gte?: string | undefined;
    /** does the column match the given case-insensitive pattern */
    _ilike?: string | undefined;
    _in?: Array<string> | undefined;
    /** does the column match the given POSIX regular expression, case insensitive */
    _iregex?: string | undefined;
    _is_null?: boolean | undefined;
    /** does the column match the given pattern */
    _like?: string | undefined;
    _lt?: string | undefined;
    _lte?: string | undefined;
    _neq?: string | undefined;
    /** does the column NOT match the given case-insensitive pattern */
    _nilike?: string | undefined;
    _nin?: Array<string> | undefined;
    /** does the column NOT match the given POSIX regular expression, case insensitive */
    _niregex?: string | undefined;
    /** does the column NOT match the given pattern */
    _nlike?: string | undefined;
    /** does the column NOT match the given POSIX regular expression, case sensitive */
    _nregex?: string | undefined;
    /** does the column NOT match the given SQL regular expression */
    _nsimilar?: string | undefined;
    /** does the column match the given POSIX regular expression, case sensitive */
    _regex?: string | undefined;
    /** does the column match the given SQL regular expression */
    _similar?: string | undefined;
  };
  ["subscription_root"]: {
    /** fetch data from the table: "access_codes" */
    access_codes: Array<ModelTypes["access_codes"]>;
    /** fetch aggregated fields from the table: "access_codes" */
    access_codes_aggregate: ModelTypes["access_codes_aggregate"];
    /** fetch data from the table: "access_codes" using primary key columns */
    access_codes_by_pk?: ModelTypes["access_codes"] | undefined;
    /** fetch data from the table in a streaming manner: "access_codes" */
    access_codes_stream: Array<ModelTypes["access_codes"]>;
    /** An array relationship */
    access_tokens: Array<ModelTypes["access_tokens"]>;
    /** An aggregate relationship */
    access_tokens_aggregate: ModelTypes["access_tokens_aggregate"];
    /** fetch data from the table: "access_tokens" using primary key columns */
    access_tokens_by_pk?: ModelTypes["access_tokens"] | undefined;
    /** fetch data from the table in a streaming manner: "access_tokens" */
    access_tokens_stream: Array<ModelTypes["access_tokens"]>;
    /** fetch data from the table: "burgers" */
    burgers: Array<ModelTypes["burgers"]>;
    /** fetch aggregated fields from the table: "burgers" */
    burgers_aggregate: ModelTypes["burgers_aggregate"];
    /** fetch data from the table: "burgers" using primary key columns */
    burgers_by_pk?: ModelTypes["burgers"] | undefined;
    /** fetch data from the table in a streaming manner: "burgers" */
    burgers_stream: Array<ModelTypes["burgers"]>;
    /** fetch data from the table: "clients" */
    clients: Array<ModelTypes["clients"]>;
    /** fetch aggregated fields from the table: "clients" */
    clients_aggregate: ModelTypes["clients_aggregate"];
    /** fetch data from the table: "clients" using primary key columns */
    clients_by_pk?: ModelTypes["clients"] | undefined;
    /** fetch data from the table in a streaming manner: "clients" */
    clients_stream: Array<ModelTypes["clients"]>;
    /** An array relationship */
    refresh_tokens: Array<ModelTypes["refresh_tokens"]>;
    /** An aggregate relationship */
    refresh_tokens_aggregate: ModelTypes["refresh_tokens_aggregate"];
    /** fetch data from the table: "refresh_tokens" using primary key columns */
    refresh_tokens_by_pk?: ModelTypes["refresh_tokens"] | undefined;
    /** fetch data from the table in a streaming manner: "refresh_tokens" */
    refresh_tokens_stream: Array<ModelTypes["refresh_tokens"]>;
  };
  ["uuid"]: any;
  /** Boolean expression to compare columns of type "uuid". All fields are combined with logical 'AND'. */
  ["uuid_comparison_exp"]: {
    _eq?: ModelTypes["uuid"] | undefined;
    _gt?: ModelTypes["uuid"] | undefined;
    _gte?: ModelTypes["uuid"] | undefined;
    _in?: Array<ModelTypes["uuid"]> | undefined;
    _is_null?: boolean | undefined;
    _lt?: ModelTypes["uuid"] | undefined;
    _lte?: ModelTypes["uuid"] | undefined;
    _neq?: ModelTypes["uuid"] | undefined;
    _nin?: Array<ModelTypes["uuid"]> | undefined;
  };
};

export type GraphQLTypes = {
  /** OAuth 2.0 access code grants. */
  ["access_codes"]: {
    __typename: "access_codes";
    /** An array relationship */
    access_tokens: Array<GraphQLTypes["access_tokens"]>;
    /** An aggregate relationship */
    access_tokens_aggregate: GraphQLTypes["access_tokens_aggregate"];
    client: GraphQLTypes["uuid"];
    /** An object relationship */
    clients?: GraphQLTypes["clients"] | undefined;
    code: GraphQLTypes["uuid"];
    id: GraphQLTypes["uuid"];
    /** An array relationship */
    refresh_tokens: Array<GraphQLTypes["refresh_tokens"]>;
    /** An aggregate relationship */
    refresh_tokens_aggregate: GraphQLTypes["refresh_tokens_aggregate"];
    scope: Array<string>;
    used: boolean;
    user_id: string;
  };
  /** aggregated selection of "access_codes" */
  ["access_codes_aggregate"]: {
    __typename: "access_codes_aggregate";
    aggregate?: GraphQLTypes["access_codes_aggregate_fields"] | undefined;
    nodes: Array<GraphQLTypes["access_codes"]>;
  };
  /** aggregate fields of "access_codes" */
  ["access_codes_aggregate_fields"]: {
    __typename: "access_codes_aggregate_fields";
    count: number;
    max?: GraphQLTypes["access_codes_max_fields"] | undefined;
    min?: GraphQLTypes["access_codes_min_fields"] | undefined;
  };
  /** Boolean expression to filter rows from the table "access_codes". All fields are combined with a logical 'AND'. */
  ["access_codes_bool_exp"]: {
    _and?: Array<GraphQLTypes["access_codes_bool_exp"]> | undefined;
    _not?: GraphQLTypes["access_codes_bool_exp"] | undefined;
    _or?: Array<GraphQLTypes["access_codes_bool_exp"]> | undefined;
    access_tokens?: GraphQLTypes["access_tokens_bool_exp"] | undefined;
    access_tokens_aggregate?:
      | GraphQLTypes["access_tokens_aggregate_bool_exp"]
      | undefined;
    client?: GraphQLTypes["uuid_comparison_exp"] | undefined;
    clients?: GraphQLTypes["clients_bool_exp"] | undefined;
    code?: GraphQLTypes["uuid_comparison_exp"] | undefined;
    id?: GraphQLTypes["uuid_comparison_exp"] | undefined;
    refresh_tokens?: GraphQLTypes["refresh_tokens_bool_exp"] | undefined;
    refresh_tokens_aggregate?:
      | GraphQLTypes["refresh_tokens_aggregate_bool_exp"]
      | undefined;
    scope?: GraphQLTypes["String_array_comparison_exp"] | undefined;
    used?: GraphQLTypes["Boolean_comparison_exp"] | undefined;
    user_id?: GraphQLTypes["String_comparison_exp"] | undefined;
  };
  /** unique or primary key constraints on table "access_codes" */
  ["access_codes_constraint"]: access_codes_constraint;
  /** input type for inserting data into table "access_codes" */
  ["access_codes_insert_input"]: {
    access_tokens?:
      | GraphQLTypes["access_tokens_arr_rel_insert_input"]
      | undefined;
    client?: GraphQLTypes["uuid"] | undefined;
    clients?: GraphQLTypes["clients_obj_rel_insert_input"] | undefined;
    code?: GraphQLTypes["uuid"] | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    refresh_tokens?:
      | GraphQLTypes["refresh_tokens_arr_rel_insert_input"]
      | undefined;
    scope?: Array<string> | undefined;
    used?: boolean | undefined;
    user_id?: string | undefined;
  };
  /** aggregate max on columns */
  ["access_codes_max_fields"]: {
    __typename: "access_codes_max_fields";
    client?: GraphQLTypes["uuid"] | undefined;
    code?: GraphQLTypes["uuid"] | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    scope?: Array<string> | undefined;
    user_id?: string | undefined;
  };
  /** aggregate min on columns */
  ["access_codes_min_fields"]: {
    __typename: "access_codes_min_fields";
    client?: GraphQLTypes["uuid"] | undefined;
    code?: GraphQLTypes["uuid"] | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    scope?: Array<string> | undefined;
    user_id?: string | undefined;
  };
  /** response of any mutation on the table "access_codes" */
  ["access_codes_mutation_response"]: {
    __typename: "access_codes_mutation_response";
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<GraphQLTypes["access_codes"]>;
  };
  /** input type for inserting object relation for remote table "access_codes" */
  ["access_codes_obj_rel_insert_input"]: {
    data: GraphQLTypes["access_codes_insert_input"];
    /** upsert condition */
    on_conflict?: GraphQLTypes["access_codes_on_conflict"] | undefined;
  };
  /** on_conflict condition type for table "access_codes" */
  ["access_codes_on_conflict"]: {
    constraint: GraphQLTypes["access_codes_constraint"];
    update_columns: Array<GraphQLTypes["access_codes_update_column"]>;
    where?: GraphQLTypes["access_codes_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "access_codes". */
  ["access_codes_order_by"]: {
    access_tokens_aggregate?:
      | GraphQLTypes["access_tokens_aggregate_order_by"]
      | undefined;
    client?: GraphQLTypes["order_by"] | undefined;
    clients?: GraphQLTypes["clients_order_by"] | undefined;
    code?: GraphQLTypes["order_by"] | undefined;
    id?: GraphQLTypes["order_by"] | undefined;
    refresh_tokens_aggregate?:
      | GraphQLTypes["refresh_tokens_aggregate_order_by"]
      | undefined;
    scope?: GraphQLTypes["order_by"] | undefined;
    used?: GraphQLTypes["order_by"] | undefined;
    user_id?: GraphQLTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: access_codes */
  ["access_codes_pk_columns_input"]: {
    id: GraphQLTypes["uuid"];
  };
  /** select columns of table "access_codes" */
  ["access_codes_select_column"]: access_codes_select_column;
  /** input type for updating data in table "access_codes" */
  ["access_codes_set_input"]: {
    client?: GraphQLTypes["uuid"] | undefined;
    code?: GraphQLTypes["uuid"] | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    scope?: Array<string> | undefined;
    used?: boolean | undefined;
    user_id?: string | undefined;
  };
  /** Streaming cursor of the table "access_codes" */
  ["access_codes_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: GraphQLTypes["access_codes_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: GraphQLTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["access_codes_stream_cursor_value_input"]: {
    client?: GraphQLTypes["uuid"] | undefined;
    code?: GraphQLTypes["uuid"] | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    scope?: Array<string> | undefined;
    used?: boolean | undefined;
    user_id?: string | undefined;
  };
  /** update columns of table "access_codes" */
  ["access_codes_update_column"]: access_codes_update_column;
  ["access_codes_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: GraphQLTypes["access_codes_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: GraphQLTypes["access_codes_bool_exp"];
  };
  /** Minted OAuth 2.0 access tokens. Used to track revocations in the event of an access code replay. */
  ["access_tokens"]: {
    __typename: "access_tokens";
    access_code: GraphQLTypes["uuid"];
    jti: string;
  };
  /** aggregated selection of "access_tokens" */
  ["access_tokens_aggregate"]: {
    __typename: "access_tokens_aggregate";
    aggregate?: GraphQLTypes["access_tokens_aggregate_fields"] | undefined;
    nodes: Array<GraphQLTypes["access_tokens"]>;
  };
  ["access_tokens_aggregate_bool_exp"]: {
    count?: GraphQLTypes["access_tokens_aggregate_bool_exp_count"] | undefined;
  };
  ["access_tokens_aggregate_bool_exp_count"]: {
    arguments?: Array<GraphQLTypes["access_tokens_select_column"]> | undefined;
    distinct?: boolean | undefined;
    filter?: GraphQLTypes["access_tokens_bool_exp"] | undefined;
    predicate: GraphQLTypes["Int_comparison_exp"];
  };
  /** aggregate fields of "access_tokens" */
  ["access_tokens_aggregate_fields"]: {
    __typename: "access_tokens_aggregate_fields";
    count: number;
    max?: GraphQLTypes["access_tokens_max_fields"] | undefined;
    min?: GraphQLTypes["access_tokens_min_fields"] | undefined;
  };
  /** order by aggregate values of table "access_tokens" */
  ["access_tokens_aggregate_order_by"]: {
    count?: GraphQLTypes["order_by"] | undefined;
    max?: GraphQLTypes["access_tokens_max_order_by"] | undefined;
    min?: GraphQLTypes["access_tokens_min_order_by"] | undefined;
  };
  /** input type for inserting array relation for remote table "access_tokens" */
  ["access_tokens_arr_rel_insert_input"]: {
    data: Array<GraphQLTypes["access_tokens_insert_input"]>;
    /** upsert condition */
    on_conflict?: GraphQLTypes["access_tokens_on_conflict"] | undefined;
  };
  /** Boolean expression to filter rows from the table "access_tokens". All fields are combined with a logical 'AND'. */
  ["access_tokens_bool_exp"]: {
    _and?: Array<GraphQLTypes["access_tokens_bool_exp"]> | undefined;
    _not?: GraphQLTypes["access_tokens_bool_exp"] | undefined;
    _or?: Array<GraphQLTypes["access_tokens_bool_exp"]> | undefined;
    access_code?: GraphQLTypes["uuid_comparison_exp"] | undefined;
    jti?: GraphQLTypes["String_comparison_exp"] | undefined;
  };
  /** unique or primary key constraints on table "access_tokens" */
  ["access_tokens_constraint"]: access_tokens_constraint;
  /** input type for inserting data into table "access_tokens" */
  ["access_tokens_insert_input"]: {
    access_code?: GraphQLTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** aggregate max on columns */
  ["access_tokens_max_fields"]: {
    __typename: "access_tokens_max_fields";
    access_code?: GraphQLTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** order by max() on columns of table "access_tokens" */
  ["access_tokens_max_order_by"]: {
    access_code?: GraphQLTypes["order_by"] | undefined;
    jti?: GraphQLTypes["order_by"] | undefined;
  };
  /** aggregate min on columns */
  ["access_tokens_min_fields"]: {
    __typename: "access_tokens_min_fields";
    access_code?: GraphQLTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** order by min() on columns of table "access_tokens" */
  ["access_tokens_min_order_by"]: {
    access_code?: GraphQLTypes["order_by"] | undefined;
    jti?: GraphQLTypes["order_by"] | undefined;
  };
  /** response of any mutation on the table "access_tokens" */
  ["access_tokens_mutation_response"]: {
    __typename: "access_tokens_mutation_response";
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<GraphQLTypes["access_tokens"]>;
  };
  /** on_conflict condition type for table "access_tokens" */
  ["access_tokens_on_conflict"]: {
    constraint: GraphQLTypes["access_tokens_constraint"];
    update_columns: Array<GraphQLTypes["access_tokens_update_column"]>;
    where?: GraphQLTypes["access_tokens_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "access_tokens". */
  ["access_tokens_order_by"]: {
    access_code?: GraphQLTypes["order_by"] | undefined;
    jti?: GraphQLTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: access_tokens */
  ["access_tokens_pk_columns_input"]: {
    jti: string;
  };
  /** select columns of table "access_tokens" */
  ["access_tokens_select_column"]: access_tokens_select_column;
  /** input type for updating data in table "access_tokens" */
  ["access_tokens_set_input"]: {
    access_code?: GraphQLTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** Streaming cursor of the table "access_tokens" */
  ["access_tokens_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: GraphQLTypes["access_tokens_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: GraphQLTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["access_tokens_stream_cursor_value_input"]: {
    access_code?: GraphQLTypes["uuid"] | undefined;
    jti?: string | undefined;
  };
  /** update columns of table "access_tokens" */
  ["access_tokens_update_column"]: access_tokens_update_column;
  ["access_tokens_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: GraphQLTypes["access_tokens_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: GraphQLTypes["access_tokens_bool_exp"];
  };
  /** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
  ["Boolean_comparison_exp"]: {
    _eq?: boolean | undefined;
    _gt?: boolean | undefined;
    _gte?: boolean | undefined;
    _in?: Array<boolean> | undefined;
    _is_null?: boolean | undefined;
    _lt?: boolean | undefined;
    _lte?: boolean | undefined;
    _neq?: boolean | undefined;
    _nin?: Array<boolean> | undefined;
  };
  /** Burger counts for users. */
  ["burgers"]: {
    __typename: "burgers";
    count: number;
    user_id: string;
  };
  /** aggregated selection of "burgers" */
  ["burgers_aggregate"]: {
    __typename: "burgers_aggregate";
    aggregate?: GraphQLTypes["burgers_aggregate_fields"] | undefined;
    nodes: Array<GraphQLTypes["burgers"]>;
  };
  /** aggregate fields of "burgers" */
  ["burgers_aggregate_fields"]: {
    __typename: "burgers_aggregate_fields";
    avg?: GraphQLTypes["burgers_avg_fields"] | undefined;
    count: number;
    max?: GraphQLTypes["burgers_max_fields"] | undefined;
    min?: GraphQLTypes["burgers_min_fields"] | undefined;
    stddev?: GraphQLTypes["burgers_stddev_fields"] | undefined;
    stddev_pop?: GraphQLTypes["burgers_stddev_pop_fields"] | undefined;
    stddev_samp?: GraphQLTypes["burgers_stddev_samp_fields"] | undefined;
    sum?: GraphQLTypes["burgers_sum_fields"] | undefined;
    var_pop?: GraphQLTypes["burgers_var_pop_fields"] | undefined;
    var_samp?: GraphQLTypes["burgers_var_samp_fields"] | undefined;
    variance?: GraphQLTypes["burgers_variance_fields"] | undefined;
  };
  /** aggregate avg on columns */
  ["burgers_avg_fields"]: {
    __typename: "burgers_avg_fields";
    count?: number | undefined;
  };
  /** Boolean expression to filter rows from the table "burgers". All fields are combined with a logical 'AND'. */
  ["burgers_bool_exp"]: {
    _and?: Array<GraphQLTypes["burgers_bool_exp"]> | undefined;
    _not?: GraphQLTypes["burgers_bool_exp"] | undefined;
    _or?: Array<GraphQLTypes["burgers_bool_exp"]> | undefined;
    count?: GraphQLTypes["Int_comparison_exp"] | undefined;
    user_id?: GraphQLTypes["String_comparison_exp"] | undefined;
  };
  /** unique or primary key constraints on table "burgers" */
  ["burgers_constraint"]: burgers_constraint;
  /** input type for incrementing numeric columns in table "burgers" */
  ["burgers_inc_input"]: {
    count?: number | undefined;
  };
  /** input type for inserting data into table "burgers" */
  ["burgers_insert_input"]: {
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** aggregate max on columns */
  ["burgers_max_fields"]: {
    __typename: "burgers_max_fields";
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** aggregate min on columns */
  ["burgers_min_fields"]: {
    __typename: "burgers_min_fields";
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** response of any mutation on the table "burgers" */
  ["burgers_mutation_response"]: {
    __typename: "burgers_mutation_response";
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<GraphQLTypes["burgers"]>;
  };
  /** on_conflict condition type for table "burgers" */
  ["burgers_on_conflict"]: {
    constraint: GraphQLTypes["burgers_constraint"];
    update_columns: Array<GraphQLTypes["burgers_update_column"]>;
    where?: GraphQLTypes["burgers_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "burgers". */
  ["burgers_order_by"]: {
    count?: GraphQLTypes["order_by"] | undefined;
    user_id?: GraphQLTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: burgers */
  ["burgers_pk_columns_input"]: {
    user_id: string;
  };
  /** select columns of table "burgers" */
  ["burgers_select_column"]: burgers_select_column;
  /** input type for updating data in table "burgers" */
  ["burgers_set_input"]: {
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** aggregate stddev on columns */
  ["burgers_stddev_fields"]: {
    __typename: "burgers_stddev_fields";
    count?: number | undefined;
  };
  /** aggregate stddev_pop on columns */
  ["burgers_stddev_pop_fields"]: {
    __typename: "burgers_stddev_pop_fields";
    count?: number | undefined;
  };
  /** aggregate stddev_samp on columns */
  ["burgers_stddev_samp_fields"]: {
    __typename: "burgers_stddev_samp_fields";
    count?: number | undefined;
  };
  /** Streaming cursor of the table "burgers" */
  ["burgers_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: GraphQLTypes["burgers_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: GraphQLTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["burgers_stream_cursor_value_input"]: {
    count?: number | undefined;
    user_id?: string | undefined;
  };
  /** aggregate sum on columns */
  ["burgers_sum_fields"]: {
    __typename: "burgers_sum_fields";
    count?: number | undefined;
  };
  /** update columns of table "burgers" */
  ["burgers_update_column"]: burgers_update_column;
  ["burgers_updates"]: {
    /** increments the numeric columns with given value of the filtered values */
    _inc?: GraphQLTypes["burgers_inc_input"] | undefined;
    /** sets the columns of the filtered rows to the given values */
    _set?: GraphQLTypes["burgers_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: GraphQLTypes["burgers_bool_exp"];
  };
  /** aggregate var_pop on columns */
  ["burgers_var_pop_fields"]: {
    __typename: "burgers_var_pop_fields";
    count?: number | undefined;
  };
  /** aggregate var_samp on columns */
  ["burgers_var_samp_fields"]: {
    __typename: "burgers_var_samp_fields";
    count?: number | undefined;
  };
  /** aggregate variance on columns */
  ["burgers_variance_fields"]: {
    __typename: "burgers_variance_fields";
    count?: number | undefined;
  };
  /** Registered OAuth 2.0 clients. */
  ["clients"]: {
    __typename: "clients";
    client_id: string;
    client_secret_hash: string;
    id: GraphQLTypes["uuid"];
    name: string;
    redirect_uri: string;
  };
  /** aggregated selection of "clients" */
  ["clients_aggregate"]: {
    __typename: "clients_aggregate";
    aggregate?: GraphQLTypes["clients_aggregate_fields"] | undefined;
    nodes: Array<GraphQLTypes["clients"]>;
  };
  /** aggregate fields of "clients" */
  ["clients_aggregate_fields"]: {
    __typename: "clients_aggregate_fields";
    count: number;
    max?: GraphQLTypes["clients_max_fields"] | undefined;
    min?: GraphQLTypes["clients_min_fields"] | undefined;
  };
  /** Boolean expression to filter rows from the table "clients". All fields are combined with a logical 'AND'. */
  ["clients_bool_exp"]: {
    _and?: Array<GraphQLTypes["clients_bool_exp"]> | undefined;
    _not?: GraphQLTypes["clients_bool_exp"] | undefined;
    _or?: Array<GraphQLTypes["clients_bool_exp"]> | undefined;
    client_id?: GraphQLTypes["String_comparison_exp"] | undefined;
    client_secret_hash?: GraphQLTypes["String_comparison_exp"] | undefined;
    id?: GraphQLTypes["uuid_comparison_exp"] | undefined;
    name?: GraphQLTypes["String_comparison_exp"] | undefined;
    redirect_uri?: GraphQLTypes["String_comparison_exp"] | undefined;
  };
  /** unique or primary key constraints on table "clients" */
  ["clients_constraint"]: clients_constraint;
  /** input type for inserting data into table "clients" */
  ["clients_insert_input"]: {
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** aggregate max on columns */
  ["clients_max_fields"]: {
    __typename: "clients_max_fields";
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** aggregate min on columns */
  ["clients_min_fields"]: {
    __typename: "clients_min_fields";
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** response of any mutation on the table "clients" */
  ["clients_mutation_response"]: {
    __typename: "clients_mutation_response";
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<GraphQLTypes["clients"]>;
  };
  /** input type for inserting object relation for remote table "clients" */
  ["clients_obj_rel_insert_input"]: {
    data: GraphQLTypes["clients_insert_input"];
    /** upsert condition */
    on_conflict?: GraphQLTypes["clients_on_conflict"] | undefined;
  };
  /** on_conflict condition type for table "clients" */
  ["clients_on_conflict"]: {
    constraint: GraphQLTypes["clients_constraint"];
    update_columns: Array<GraphQLTypes["clients_update_column"]>;
    where?: GraphQLTypes["clients_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "clients". */
  ["clients_order_by"]: {
    client_id?: GraphQLTypes["order_by"] | undefined;
    client_secret_hash?: GraphQLTypes["order_by"] | undefined;
    id?: GraphQLTypes["order_by"] | undefined;
    name?: GraphQLTypes["order_by"] | undefined;
    redirect_uri?: GraphQLTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: clients */
  ["clients_pk_columns_input"]: {
    id: GraphQLTypes["uuid"];
  };
  /** select columns of table "clients" */
  ["clients_select_column"]: clients_select_column;
  /** input type for updating data in table "clients" */
  ["clients_set_input"]: {
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** Streaming cursor of the table "clients" */
  ["clients_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: GraphQLTypes["clients_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: GraphQLTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["clients_stream_cursor_value_input"]: {
    client_id?: string | undefined;
    client_secret_hash?: string | undefined;
    id?: GraphQLTypes["uuid"] | undefined;
    name?: string | undefined;
    redirect_uri?: string | undefined;
  };
  /** update columns of table "clients" */
  ["clients_update_column"]: clients_update_column;
  ["clients_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: GraphQLTypes["clients_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: GraphQLTypes["clients_bool_exp"];
  };
  /** ordering argument of a cursor */
  ["cursor_ordering"]: cursor_ordering;
  /** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
  ["Int_comparison_exp"]: {
    _eq?: number | undefined;
    _gt?: number | undefined;
    _gte?: number | undefined;
    _in?: Array<number> | undefined;
    _is_null?: boolean | undefined;
    _lt?: number | undefined;
    _lte?: number | undefined;
    _neq?: number | undefined;
    _nin?: Array<number> | undefined;
  };
  /** mutation root */
  ["mutation_root"]: {
    __typename: "mutation_root";
    /** delete data from the table: "access_codes" */
    delete_access_codes?:
      | GraphQLTypes["access_codes_mutation_response"]
      | undefined;
    /** delete single row from the table: "access_codes" */
    delete_access_codes_by_pk?: GraphQLTypes["access_codes"] | undefined;
    /** delete data from the table: "access_tokens" */
    delete_access_tokens?:
      | GraphQLTypes["access_tokens_mutation_response"]
      | undefined;
    /** delete single row from the table: "access_tokens" */
    delete_access_tokens_by_pk?: GraphQLTypes["access_tokens"] | undefined;
    /** delete data from the table: "burgers" */
    delete_burgers?: GraphQLTypes["burgers_mutation_response"] | undefined;
    /** delete single row from the table: "burgers" */
    delete_burgers_by_pk?: GraphQLTypes["burgers"] | undefined;
    /** delete data from the table: "clients" */
    delete_clients?: GraphQLTypes["clients_mutation_response"] | undefined;
    /** delete single row from the table: "clients" */
    delete_clients_by_pk?: GraphQLTypes["clients"] | undefined;
    /** delete data from the table: "refresh_tokens" */
    delete_refresh_tokens?:
      | GraphQLTypes["refresh_tokens_mutation_response"]
      | undefined;
    /** delete single row from the table: "refresh_tokens" */
    delete_refresh_tokens_by_pk?: GraphQLTypes["refresh_tokens"] | undefined;
    /** insert data into the table: "access_codes" */
    insert_access_codes?:
      | GraphQLTypes["access_codes_mutation_response"]
      | undefined;
    /** insert a single row into the table: "access_codes" */
    insert_access_codes_one?: GraphQLTypes["access_codes"] | undefined;
    /** insert data into the table: "access_tokens" */
    insert_access_tokens?:
      | GraphQLTypes["access_tokens_mutation_response"]
      | undefined;
    /** insert a single row into the table: "access_tokens" */
    insert_access_tokens_one?: GraphQLTypes["access_tokens"] | undefined;
    /** insert data into the table: "burgers" */
    insert_burgers?: GraphQLTypes["burgers_mutation_response"] | undefined;
    /** insert a single row into the table: "burgers" */
    insert_burgers_one?: GraphQLTypes["burgers"] | undefined;
    /** insert data into the table: "clients" */
    insert_clients?: GraphQLTypes["clients_mutation_response"] | undefined;
    /** insert a single row into the table: "clients" */
    insert_clients_one?: GraphQLTypes["clients"] | undefined;
    /** insert data into the table: "refresh_tokens" */
    insert_refresh_tokens?:
      | GraphQLTypes["refresh_tokens_mutation_response"]
      | undefined;
    /** insert a single row into the table: "refresh_tokens" */
    insert_refresh_tokens_one?: GraphQLTypes["refresh_tokens"] | undefined;
    /** update data of the table: "access_codes" */
    update_access_codes?:
      | GraphQLTypes["access_codes_mutation_response"]
      | undefined;
    /** update single row of the table: "access_codes" */
    update_access_codes_by_pk?: GraphQLTypes["access_codes"] | undefined;
    /** update multiples rows of table: "access_codes" */
    update_access_codes_many?:
      | Array<GraphQLTypes["access_codes_mutation_response"] | undefined>
      | undefined;
    /** update data of the table: "access_tokens" */
    update_access_tokens?:
      | GraphQLTypes["access_tokens_mutation_response"]
      | undefined;
    /** update single row of the table: "access_tokens" */
    update_access_tokens_by_pk?: GraphQLTypes["access_tokens"] | undefined;
    /** update multiples rows of table: "access_tokens" */
    update_access_tokens_many?:
      | Array<GraphQLTypes["access_tokens_mutation_response"] | undefined>
      | undefined;
    /** update data of the table: "burgers" */
    update_burgers?: GraphQLTypes["burgers_mutation_response"] | undefined;
    /** update single row of the table: "burgers" */
    update_burgers_by_pk?: GraphQLTypes["burgers"] | undefined;
    /** update multiples rows of table: "burgers" */
    update_burgers_many?:
      | Array<GraphQLTypes["burgers_mutation_response"] | undefined>
      | undefined;
    /** update data of the table: "clients" */
    update_clients?: GraphQLTypes["clients_mutation_response"] | undefined;
    /** update single row of the table: "clients" */
    update_clients_by_pk?: GraphQLTypes["clients"] | undefined;
    /** update multiples rows of table: "clients" */
    update_clients_many?:
      | Array<GraphQLTypes["clients_mutation_response"] | undefined>
      | undefined;
    /** update data of the table: "refresh_tokens" */
    update_refresh_tokens?:
      | GraphQLTypes["refresh_tokens_mutation_response"]
      | undefined;
    /** update single row of the table: "refresh_tokens" */
    update_refresh_tokens_by_pk?: GraphQLTypes["refresh_tokens"] | undefined;
    /** update multiples rows of table: "refresh_tokens" */
    update_refresh_tokens_many?:
      | Array<GraphQLTypes["refresh_tokens_mutation_response"] | undefined>
      | undefined;
  };
  /** column ordering options */
  ["order_by"]: order_by;
  ["query_root"]: {
    __typename: "query_root";
    /** fetch data from the table: "access_codes" */
    access_codes: Array<GraphQLTypes["access_codes"]>;
    /** fetch aggregated fields from the table: "access_codes" */
    access_codes_aggregate: GraphQLTypes["access_codes_aggregate"];
    /** fetch data from the table: "access_codes" using primary key columns */
    access_codes_by_pk?: GraphQLTypes["access_codes"] | undefined;
    /** An array relationship */
    access_tokens: Array<GraphQLTypes["access_tokens"]>;
    /** An aggregate relationship */
    access_tokens_aggregate: GraphQLTypes["access_tokens_aggregate"];
    /** fetch data from the table: "access_tokens" using primary key columns */
    access_tokens_by_pk?: GraphQLTypes["access_tokens"] | undefined;
    /** fetch data from the table: "burgers" */
    burgers: Array<GraphQLTypes["burgers"]>;
    /** fetch aggregated fields from the table: "burgers" */
    burgers_aggregate: GraphQLTypes["burgers_aggregate"];
    /** fetch data from the table: "burgers" using primary key columns */
    burgers_by_pk?: GraphQLTypes["burgers"] | undefined;
    /** fetch data from the table: "clients" */
    clients: Array<GraphQLTypes["clients"]>;
    /** fetch aggregated fields from the table: "clients" */
    clients_aggregate: GraphQLTypes["clients_aggregate"];
    /** fetch data from the table: "clients" using primary key columns */
    clients_by_pk?: GraphQLTypes["clients"] | undefined;
    /** An array relationship */
    refresh_tokens: Array<GraphQLTypes["refresh_tokens"]>;
    /** An aggregate relationship */
    refresh_tokens_aggregate: GraphQLTypes["refresh_tokens_aggregate"];
    /** fetch data from the table: "refresh_tokens" using primary key columns */
    refresh_tokens_by_pk?: GraphQLTypes["refresh_tokens"] | undefined;
  };
  /** OAuth 2.0 refresh tokens associated with auth codes. */
  ["refresh_tokens"]: {
    __typename: "refresh_tokens";
    /** An object relationship */
    access_code: GraphQLTypes["access_codes"];
    auth_code: GraphQLTypes["uuid"];
    token_hash: string;
  };
  /** aggregated selection of "refresh_tokens" */
  ["refresh_tokens_aggregate"]: {
    __typename: "refresh_tokens_aggregate";
    aggregate?: GraphQLTypes["refresh_tokens_aggregate_fields"] | undefined;
    nodes: Array<GraphQLTypes["refresh_tokens"]>;
  };
  ["refresh_tokens_aggregate_bool_exp"]: {
    count?: GraphQLTypes["refresh_tokens_aggregate_bool_exp_count"] | undefined;
  };
  ["refresh_tokens_aggregate_bool_exp_count"]: {
    arguments?: Array<GraphQLTypes["refresh_tokens_select_column"]> | undefined;
    distinct?: boolean | undefined;
    filter?: GraphQLTypes["refresh_tokens_bool_exp"] | undefined;
    predicate: GraphQLTypes["Int_comparison_exp"];
  };
  /** aggregate fields of "refresh_tokens" */
  ["refresh_tokens_aggregate_fields"]: {
    __typename: "refresh_tokens_aggregate_fields";
    count: number;
    max?: GraphQLTypes["refresh_tokens_max_fields"] | undefined;
    min?: GraphQLTypes["refresh_tokens_min_fields"] | undefined;
  };
  /** order by aggregate values of table "refresh_tokens" */
  ["refresh_tokens_aggregate_order_by"]: {
    count?: GraphQLTypes["order_by"] | undefined;
    max?: GraphQLTypes["refresh_tokens_max_order_by"] | undefined;
    min?: GraphQLTypes["refresh_tokens_min_order_by"] | undefined;
  };
  /** input type for inserting array relation for remote table "refresh_tokens" */
  ["refresh_tokens_arr_rel_insert_input"]: {
    data: Array<GraphQLTypes["refresh_tokens_insert_input"]>;
    /** upsert condition */
    on_conflict?: GraphQLTypes["refresh_tokens_on_conflict"] | undefined;
  };
  /** Boolean expression to filter rows from the table "refresh_tokens". All fields are combined with a logical 'AND'. */
  ["refresh_tokens_bool_exp"]: {
    _and?: Array<GraphQLTypes["refresh_tokens_bool_exp"]> | undefined;
    _not?: GraphQLTypes["refresh_tokens_bool_exp"] | undefined;
    _or?: Array<GraphQLTypes["refresh_tokens_bool_exp"]> | undefined;
    access_code?: GraphQLTypes["access_codes_bool_exp"] | undefined;
    auth_code?: GraphQLTypes["uuid_comparison_exp"] | undefined;
    token_hash?: GraphQLTypes["String_comparison_exp"] | undefined;
  };
  /** unique or primary key constraints on table "refresh_tokens" */
  ["refresh_tokens_constraint"]: refresh_tokens_constraint;
  /** input type for inserting data into table "refresh_tokens" */
  ["refresh_tokens_insert_input"]: {
    access_code?: GraphQLTypes["access_codes_obj_rel_insert_input"] | undefined;
    auth_code?: GraphQLTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** aggregate max on columns */
  ["refresh_tokens_max_fields"]: {
    __typename: "refresh_tokens_max_fields";
    auth_code?: GraphQLTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** order by max() on columns of table "refresh_tokens" */
  ["refresh_tokens_max_order_by"]: {
    auth_code?: GraphQLTypes["order_by"] | undefined;
    token_hash?: GraphQLTypes["order_by"] | undefined;
  };
  /** aggregate min on columns */
  ["refresh_tokens_min_fields"]: {
    __typename: "refresh_tokens_min_fields";
    auth_code?: GraphQLTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** order by min() on columns of table "refresh_tokens" */
  ["refresh_tokens_min_order_by"]: {
    auth_code?: GraphQLTypes["order_by"] | undefined;
    token_hash?: GraphQLTypes["order_by"] | undefined;
  };
  /** response of any mutation on the table "refresh_tokens" */
  ["refresh_tokens_mutation_response"]: {
    __typename: "refresh_tokens_mutation_response";
    /** number of rows affected by the mutation */
    affected_rows: number;
    /** data from the rows affected by the mutation */
    returning: Array<GraphQLTypes["refresh_tokens"]>;
  };
  /** on_conflict condition type for table "refresh_tokens" */
  ["refresh_tokens_on_conflict"]: {
    constraint: GraphQLTypes["refresh_tokens_constraint"];
    update_columns: Array<GraphQLTypes["refresh_tokens_update_column"]>;
    where?: GraphQLTypes["refresh_tokens_bool_exp"] | undefined;
  };
  /** Ordering options when selecting data from "refresh_tokens". */
  ["refresh_tokens_order_by"]: {
    access_code?: GraphQLTypes["access_codes_order_by"] | undefined;
    auth_code?: GraphQLTypes["order_by"] | undefined;
    token_hash?: GraphQLTypes["order_by"] | undefined;
  };
  /** primary key columns input for table: refresh_tokens */
  ["refresh_tokens_pk_columns_input"]: {
    token_hash: string;
  };
  /** select columns of table "refresh_tokens" */
  ["refresh_tokens_select_column"]: refresh_tokens_select_column;
  /** input type for updating data in table "refresh_tokens" */
  ["refresh_tokens_set_input"]: {
    auth_code?: GraphQLTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** Streaming cursor of the table "refresh_tokens" */
  ["refresh_tokens_stream_cursor_input"]: {
    /** Stream column input with initial value */
    initial_value: GraphQLTypes["refresh_tokens_stream_cursor_value_input"];
    /** cursor ordering */
    ordering?: GraphQLTypes["cursor_ordering"] | undefined;
  };
  /** Initial value of the column from where the streaming should start */
  ["refresh_tokens_stream_cursor_value_input"]: {
    auth_code?: GraphQLTypes["uuid"] | undefined;
    token_hash?: string | undefined;
  };
  /** update columns of table "refresh_tokens" */
  ["refresh_tokens_update_column"]: refresh_tokens_update_column;
  ["refresh_tokens_updates"]: {
    /** sets the columns of the filtered rows to the given values */
    _set?: GraphQLTypes["refresh_tokens_set_input"] | undefined;
    /** filter the rows which have to be updated */
    where: GraphQLTypes["refresh_tokens_bool_exp"];
  };
  /** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
  ["String_array_comparison_exp"]: {
    /** is the array contained in the given array value */
    _contained_in?: Array<string> | undefined;
    /** does the array contain the given value */
    _contains?: Array<string> | undefined;
    _eq?: Array<string> | undefined;
    _gt?: Array<string> | undefined;
    _gte?: Array<string> | undefined;
    _in?: Array<Array<string> | undefined>;
    _is_null?: boolean | undefined;
    _lt?: Array<string> | undefined;
    _lte?: Array<string> | undefined;
    _neq?: Array<string> | undefined;
    _nin?: Array<Array<string> | undefined>;
  };
  /** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
  ["String_comparison_exp"]: {
    _eq?: string | undefined;
    _gt?: string | undefined;
    _gte?: string | undefined;
    /** does the column match the given case-insensitive pattern */
    _ilike?: string | undefined;
    _in?: Array<string> | undefined;
    /** does the column match the given POSIX regular expression, case insensitive */
    _iregex?: string | undefined;
    _is_null?: boolean | undefined;
    /** does the column match the given pattern */
    _like?: string | undefined;
    _lt?: string | undefined;
    _lte?: string | undefined;
    _neq?: string | undefined;
    /** does the column NOT match the given case-insensitive pattern */
    _nilike?: string | undefined;
    _nin?: Array<string> | undefined;
    /** does the column NOT match the given POSIX regular expression, case insensitive */
    _niregex?: string | undefined;
    /** does the column NOT match the given pattern */
    _nlike?: string | undefined;
    /** does the column NOT match the given POSIX regular expression, case sensitive */
    _nregex?: string | undefined;
    /** does the column NOT match the given SQL regular expression */
    _nsimilar?: string | undefined;
    /** does the column match the given POSIX regular expression, case sensitive */
    _regex?: string | undefined;
    /** does the column match the given SQL regular expression */
    _similar?: string | undefined;
  };
  ["subscription_root"]: {
    __typename: "subscription_root";
    /** fetch data from the table: "access_codes" */
    access_codes: Array<GraphQLTypes["access_codes"]>;
    /** fetch aggregated fields from the table: "access_codes" */
    access_codes_aggregate: GraphQLTypes["access_codes_aggregate"];
    /** fetch data from the table: "access_codes" using primary key columns */
    access_codes_by_pk?: GraphQLTypes["access_codes"] | undefined;
    /** fetch data from the table in a streaming manner: "access_codes" */
    access_codes_stream: Array<GraphQLTypes["access_codes"]>;
    /** An array relationship */
    access_tokens: Array<GraphQLTypes["access_tokens"]>;
    /** An aggregate relationship */
    access_tokens_aggregate: GraphQLTypes["access_tokens_aggregate"];
    /** fetch data from the table: "access_tokens" using primary key columns */
    access_tokens_by_pk?: GraphQLTypes["access_tokens"] | undefined;
    /** fetch data from the table in a streaming manner: "access_tokens" */
    access_tokens_stream: Array<GraphQLTypes["access_tokens"]>;
    /** fetch data from the table: "burgers" */
    burgers: Array<GraphQLTypes["burgers"]>;
    /** fetch aggregated fields from the table: "burgers" */
    burgers_aggregate: GraphQLTypes["burgers_aggregate"];
    /** fetch data from the table: "burgers" using primary key columns */
    burgers_by_pk?: GraphQLTypes["burgers"] | undefined;
    /** fetch data from the table in a streaming manner: "burgers" */
    burgers_stream: Array<GraphQLTypes["burgers"]>;
    /** fetch data from the table: "clients" */
    clients: Array<GraphQLTypes["clients"]>;
    /** fetch aggregated fields from the table: "clients" */
    clients_aggregate: GraphQLTypes["clients_aggregate"];
    /** fetch data from the table: "clients" using primary key columns */
    clients_by_pk?: GraphQLTypes["clients"] | undefined;
    /** fetch data from the table in a streaming manner: "clients" */
    clients_stream: Array<GraphQLTypes["clients"]>;
    /** An array relationship */
    refresh_tokens: Array<GraphQLTypes["refresh_tokens"]>;
    /** An aggregate relationship */
    refresh_tokens_aggregate: GraphQLTypes["refresh_tokens_aggregate"];
    /** fetch data from the table: "refresh_tokens" using primary key columns */
    refresh_tokens_by_pk?: GraphQLTypes["refresh_tokens"] | undefined;
    /** fetch data from the table in a streaming manner: "refresh_tokens" */
    refresh_tokens_stream: Array<GraphQLTypes["refresh_tokens"]>;
  };
  ["uuid"]: "scalar" & { name: "uuid" };
  /** Boolean expression to compare columns of type "uuid". All fields are combined with logical 'AND'. */
  ["uuid_comparison_exp"]: {
    _eq?: GraphQLTypes["uuid"] | undefined;
    _gt?: GraphQLTypes["uuid"] | undefined;
    _gte?: GraphQLTypes["uuid"] | undefined;
    _in?: Array<GraphQLTypes["uuid"]> | undefined;
    _is_null?: boolean | undefined;
    _lt?: GraphQLTypes["uuid"] | undefined;
    _lte?: GraphQLTypes["uuid"] | undefined;
    _neq?: GraphQLTypes["uuid"] | undefined;
    _nin?: Array<GraphQLTypes["uuid"]> | undefined;
  };
};
/** unique or primary key constraints on table "access_codes" */
export const enum access_codes_constraint {
  access_codes_code_key = "access_codes_code_key",
  access_codes_pkey = "access_codes_pkey",
}
/** select columns of table "access_codes" */
export const enum access_codes_select_column {
  client = "client",
  code = "code",
  id = "id",
  scope = "scope",
  used = "used",
  user_id = "user_id",
}
/** update columns of table "access_codes" */
export const enum access_codes_update_column {
  client = "client",
  code = "code",
  id = "id",
  scope = "scope",
  used = "used",
  user_id = "user_id",
}
/** unique or primary key constraints on table "access_tokens" */
export const enum access_tokens_constraint {
  access_tokens_pkey = "access_tokens_pkey",
}
/** select columns of table "access_tokens" */
export const enum access_tokens_select_column {
  access_code = "access_code",
  jti = "jti",
}
/** update columns of table "access_tokens" */
export const enum access_tokens_update_column {
  access_code = "access_code",
  jti = "jti",
}
/** unique or primary key constraints on table "burgers" */
export const enum burgers_constraint {
  burgers_pkey = "burgers_pkey",
}
/** select columns of table "burgers" */
export const enum burgers_select_column {
  count = "count",
  user_id = "user_id",
}
/** update columns of table "burgers" */
export const enum burgers_update_column {
  count = "count",
  user_id = "user_id",
}
/** unique or primary key constraints on table "clients" */
export const enum clients_constraint {
  clients_client_id_key = "clients_client_id_key",
  clients_pkey = "clients_pkey",
}
/** select columns of table "clients" */
export const enum clients_select_column {
  client_id = "client_id",
  client_secret_hash = "client_secret_hash",
  id = "id",
  name = "name",
  redirect_uri = "redirect_uri",
}
/** update columns of table "clients" */
export const enum clients_update_column {
  client_id = "client_id",
  client_secret_hash = "client_secret_hash",
  id = "id",
  name = "name",
  redirect_uri = "redirect_uri",
}
/** ordering argument of a cursor */
export const enum cursor_ordering {
  ASC = "ASC",
  DESC = "DESC",
}
/** column ordering options */
export const enum order_by {
  asc = "asc",
  asc_nulls_first = "asc_nulls_first",
  asc_nulls_last = "asc_nulls_last",
  desc = "desc",
  desc_nulls_first = "desc_nulls_first",
  desc_nulls_last = "desc_nulls_last",
}
/** unique or primary key constraints on table "refresh_tokens" */
export const enum refresh_tokens_constraint {
  refresh_tokens_pkey = "refresh_tokens_pkey",
}
/** select columns of table "refresh_tokens" */
export const enum refresh_tokens_select_column {
  auth_code = "auth_code",
  token_hash = "token_hash",
}
/** update columns of table "refresh_tokens" */
export const enum refresh_tokens_update_column {
  auth_code = "auth_code",
  token_hash = "token_hash",
}

type ZEUS_VARIABLES = {
  ["access_codes_bool_exp"]: ValueTypes["access_codes_bool_exp"];
  ["access_codes_constraint"]: ValueTypes["access_codes_constraint"];
  ["access_codes_insert_input"]: ValueTypes["access_codes_insert_input"];
  ["access_codes_obj_rel_insert_input"]: ValueTypes["access_codes_obj_rel_insert_input"];
  ["access_codes_on_conflict"]: ValueTypes["access_codes_on_conflict"];
  ["access_codes_order_by"]: ValueTypes["access_codes_order_by"];
  ["access_codes_pk_columns_input"]: ValueTypes["access_codes_pk_columns_input"];
  ["access_codes_select_column"]: ValueTypes["access_codes_select_column"];
  ["access_codes_set_input"]: ValueTypes["access_codes_set_input"];
  ["access_codes_stream_cursor_input"]: ValueTypes["access_codes_stream_cursor_input"];
  ["access_codes_stream_cursor_value_input"]: ValueTypes["access_codes_stream_cursor_value_input"];
  ["access_codes_update_column"]: ValueTypes["access_codes_update_column"];
  ["access_codes_updates"]: ValueTypes["access_codes_updates"];
  ["access_tokens_aggregate_bool_exp"]: ValueTypes["access_tokens_aggregate_bool_exp"];
  ["access_tokens_aggregate_bool_exp_count"]: ValueTypes["access_tokens_aggregate_bool_exp_count"];
  ["access_tokens_aggregate_order_by"]: ValueTypes["access_tokens_aggregate_order_by"];
  ["access_tokens_arr_rel_insert_input"]: ValueTypes["access_tokens_arr_rel_insert_input"];
  ["access_tokens_bool_exp"]: ValueTypes["access_tokens_bool_exp"];
  ["access_tokens_constraint"]: ValueTypes["access_tokens_constraint"];
  ["access_tokens_insert_input"]: ValueTypes["access_tokens_insert_input"];
  ["access_tokens_max_order_by"]: ValueTypes["access_tokens_max_order_by"];
  ["access_tokens_min_order_by"]: ValueTypes["access_tokens_min_order_by"];
  ["access_tokens_on_conflict"]: ValueTypes["access_tokens_on_conflict"];
  ["access_tokens_order_by"]: ValueTypes["access_tokens_order_by"];
  ["access_tokens_pk_columns_input"]: ValueTypes["access_tokens_pk_columns_input"];
  ["access_tokens_select_column"]: ValueTypes["access_tokens_select_column"];
  ["access_tokens_set_input"]: ValueTypes["access_tokens_set_input"];
  ["access_tokens_stream_cursor_input"]: ValueTypes["access_tokens_stream_cursor_input"];
  ["access_tokens_stream_cursor_value_input"]: ValueTypes["access_tokens_stream_cursor_value_input"];
  ["access_tokens_update_column"]: ValueTypes["access_tokens_update_column"];
  ["access_tokens_updates"]: ValueTypes["access_tokens_updates"];
  ["Boolean_comparison_exp"]: ValueTypes["Boolean_comparison_exp"];
  ["burgers_bool_exp"]: ValueTypes["burgers_bool_exp"];
  ["burgers_constraint"]: ValueTypes["burgers_constraint"];
  ["burgers_inc_input"]: ValueTypes["burgers_inc_input"];
  ["burgers_insert_input"]: ValueTypes["burgers_insert_input"];
  ["burgers_on_conflict"]: ValueTypes["burgers_on_conflict"];
  ["burgers_order_by"]: ValueTypes["burgers_order_by"];
  ["burgers_pk_columns_input"]: ValueTypes["burgers_pk_columns_input"];
  ["burgers_select_column"]: ValueTypes["burgers_select_column"];
  ["burgers_set_input"]: ValueTypes["burgers_set_input"];
  ["burgers_stream_cursor_input"]: ValueTypes["burgers_stream_cursor_input"];
  ["burgers_stream_cursor_value_input"]: ValueTypes["burgers_stream_cursor_value_input"];
  ["burgers_update_column"]: ValueTypes["burgers_update_column"];
  ["burgers_updates"]: ValueTypes["burgers_updates"];
  ["clients_bool_exp"]: ValueTypes["clients_bool_exp"];
  ["clients_constraint"]: ValueTypes["clients_constraint"];
  ["clients_insert_input"]: ValueTypes["clients_insert_input"];
  ["clients_obj_rel_insert_input"]: ValueTypes["clients_obj_rel_insert_input"];
  ["clients_on_conflict"]: ValueTypes["clients_on_conflict"];
  ["clients_order_by"]: ValueTypes["clients_order_by"];
  ["clients_pk_columns_input"]: ValueTypes["clients_pk_columns_input"];
  ["clients_select_column"]: ValueTypes["clients_select_column"];
  ["clients_set_input"]: ValueTypes["clients_set_input"];
  ["clients_stream_cursor_input"]: ValueTypes["clients_stream_cursor_input"];
  ["clients_stream_cursor_value_input"]: ValueTypes["clients_stream_cursor_value_input"];
  ["clients_update_column"]: ValueTypes["clients_update_column"];
  ["clients_updates"]: ValueTypes["clients_updates"];
  ["cursor_ordering"]: ValueTypes["cursor_ordering"];
  ["Int_comparison_exp"]: ValueTypes["Int_comparison_exp"];
  ["order_by"]: ValueTypes["order_by"];
  ["refresh_tokens_aggregate_bool_exp"]: ValueTypes["refresh_tokens_aggregate_bool_exp"];
  ["refresh_tokens_aggregate_bool_exp_count"]: ValueTypes["refresh_tokens_aggregate_bool_exp_count"];
  ["refresh_tokens_aggregate_order_by"]: ValueTypes["refresh_tokens_aggregate_order_by"];
  ["refresh_tokens_arr_rel_insert_input"]: ValueTypes["refresh_tokens_arr_rel_insert_input"];
  ["refresh_tokens_bool_exp"]: ValueTypes["refresh_tokens_bool_exp"];
  ["refresh_tokens_constraint"]: ValueTypes["refresh_tokens_constraint"];
  ["refresh_tokens_insert_input"]: ValueTypes["refresh_tokens_insert_input"];
  ["refresh_tokens_max_order_by"]: ValueTypes["refresh_tokens_max_order_by"];
  ["refresh_tokens_min_order_by"]: ValueTypes["refresh_tokens_min_order_by"];
  ["refresh_tokens_on_conflict"]: ValueTypes["refresh_tokens_on_conflict"];
  ["refresh_tokens_order_by"]: ValueTypes["refresh_tokens_order_by"];
  ["refresh_tokens_pk_columns_input"]: ValueTypes["refresh_tokens_pk_columns_input"];
  ["refresh_tokens_select_column"]: ValueTypes["refresh_tokens_select_column"];
  ["refresh_tokens_set_input"]: ValueTypes["refresh_tokens_set_input"];
  ["refresh_tokens_stream_cursor_input"]: ValueTypes["refresh_tokens_stream_cursor_input"];
  ["refresh_tokens_stream_cursor_value_input"]: ValueTypes["refresh_tokens_stream_cursor_value_input"];
  ["refresh_tokens_update_column"]: ValueTypes["refresh_tokens_update_column"];
  ["refresh_tokens_updates"]: ValueTypes["refresh_tokens_updates"];
  ["String_array_comparison_exp"]: ValueTypes["String_array_comparison_exp"];
  ["String_comparison_exp"]: ValueTypes["String_comparison_exp"];
  ["uuid"]: ValueTypes["uuid"];
  ["uuid_comparison_exp"]: ValueTypes["uuid_comparison_exp"];
};
