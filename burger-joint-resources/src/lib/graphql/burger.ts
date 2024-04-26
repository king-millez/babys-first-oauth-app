import { ZeusScalars } from "../generated/zeus";
import { client } from "./client";

export const burgerCount = async (userId: string) => {
  const count = (
    (
      await client("query", { scalars: ZeusScalars({}) })({
        burgers: [
          {
            where: { user_id: { _eq: userId } },
          },
          { count: true },
        ],
      })
    ).burgers[0] as { count: number } | undefined
  )?.count;

  return count === undefined ? 0 : count;
};

export const eatBurger = async (userId: string, count: number) => {
  const curCount = await burgerCount(userId);

  await client("mutation", { scalars: ZeusScalars({}) })({
    update_burgers: [
      {
        where: { user_id: { _eq: userId } },
        _set: { count: curCount + count },
      },
      { affected_rows: true },
    ],
  });

  return burgerCount(userId); // Yeah I know this could be one query. Who cares!?
};
