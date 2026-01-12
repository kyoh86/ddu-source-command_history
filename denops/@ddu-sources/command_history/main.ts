import { ActionArguments, ActionFlags, type Item } from "@shougo/ddu-vim/types";
import { BaseSource } from "@shougo/ddu-vim/source";
import type { Denops } from "@denops/core";
import * as fn from "@denops/std/function";
import { batch } from "@denops/std/batch";
import { as, is, maybe } from "@core/unknownutil";

export type ActionData = {
  raw: string;
  index: number;
  cmd?: string;
  // See :help nvim_parse_cmd()
};

type Params = {
  parse?: boolean;
};

function buildItem(_: Denops, index: number, line: string) {
  return Promise.resolve({
    word: line,
    action: {
      raw: line,
      index,
    },
  });
}

async function parseLine(denops: Denops, index: number, line: string) {
  const parsed = maybe(
    await denops.call(
      "ddu#source#command_history#parse_cmd",
      line,
    ),
    is.UnionOf([
      is.Null,
      is.ObjectOf({
        cmd: as.Optional(is.UnionOf([is.Undefined, is.String])),
        // See :help nvim_parse_cmd()
      }),
    ]),
  );
  return parsed
    ? {
      word: line,
      action: {
        raw: line,
        index,
        ...parsed,
      },
    }
    : {
      word: line,
      action: {
        raw: line,
        index,
      },
    };
}

export class Source extends BaseSource<Params> {
  override kind = "command";
  override gather({ denops, sourceParams }: {
    denops: Denops;
    sourceParams: Params;
  }): ReadableStream<Item<ActionData>[]> {
    return new ReadableStream({
      async start(controller) {
        try {
          const construct = (sourceParams.parse) ? parseLine : buildItem;
          const histnr = await fn.histnr(denops, "cmd");
          const hists = await Promise.all(Array.from(
            { length: histnr },
            (_, i) =>
              fn.histget(denops, "cmd", i + 1).then((hist) =>
                construct(denops, i + 1, (hist ?? "").trim())
              ),
          ));

          controller.enqueue(hists.reverse());
        } catch (e) {
          console.error(e);
        }
        controller.close();
      },
    });
  }

  override actions = {
    delete: async ({ denops, items }: ActionArguments<Params>) => {
      await batch(denops, async (denops) => {
        for (const item of items) {
          const action = item?.action as ActionData;
          if (item.action) {
            await fn.histdel(denops, "cmd", action.index);
          }
        }
      });
      // Note: rviminfo! is broken in Vim8 before 8.2.2494
      if (
        await fn.has(denops, "nvim") ||
        await fn.has(denops, "patch-8.2.2494")
      ) {
        await denops.cmd("wviminfo! | rviminfo!");
      }
      return Promise.resolve(ActionFlags.RefreshItems);
    },
  };

  params(): Params {
    return {};
  }
}
