import { ZeusScalars } from "../generated/zeus";
import { gqlClient } from "./client";

export const burgerCount = async (userId: string) =>
  (
    (
      await gqlClient("query", { scalars: ZeusScalars({}) })({
        burgers: [
          {
            where: { user_id: { _eq: userId } },
          },
          { count: true },
        ],
      })
    ).burgers[0] as { count: number } | undefined
  )?.count ?? 0;

export const eatBurger = async (userId: string, count: number) =>
  (
    await gqlClient("mutation", { scalars: ZeusScalars({}) })({
      update_burgers: [
        {
          where: { user_id: { _eq: userId } },
          _inc: { count },
        },
        { affected_rows: true, returning: { count: true } },
      ],
    })
  ).update_burgers?.returning[0]?.count ?? 0;
