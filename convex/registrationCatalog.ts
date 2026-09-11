import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { writeAuditLog } from "./lib/audit";
import {
  GROUP_PRICING,
  type GroupPricing,
  type RegistrationRegion,
} from "./lib/registrationConfig";
import { requireRole, sessionTokenValidator } from "./users";

const regionKeyValidator = v.union(
  v.literal("ghana"),
  v.literal("west_africa"),
  v.literal("rest_of_africa"),
  v.literal("usa"),
  v.literal("canada"),
  v.literal("switzerland"),
  v.literal("uk"),
  v.literal("rest_of_europe"),
  v.literal("rest_of_world"),
);

const gatewayValidator = v.union(
  v.literal("stripe"),
  v.literal("paystack"),
  v.literal("paypal"),
);

/** Frontend static defaults mirrored for seeding (currency symbols). */
const GROUP_SEED: Array<{
  name: string;
  price: number;
  currency: string;
  currencySymbol: string;
  gateway: "stripe" | "paystack" | "paypal";
  defaultCountryCode: string;
  regionKey: RegistrationRegion;
  denominations: string[];
}> = [
  {
    name: "Ghana",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "ghana",
    denominations: [
      "Abeka",
      "Adenta",
      "Afienya",
      "Anagkazo",
      "Asamankese",
      "Ashaiman",
      "Ashanti Mampong",
      "Assin Fosu",
      "Ayawaso",
      "Bantama",
      "Berekuso",
      "Castle City",
      "East End City Church",
      "Goaso",
      "Hohoe",
      "Korle Gonno",
      "Kotobabi",
      "Kpando",
      "La Nkwantanang",
      "Makarios Cathedral",
      "Nsawam",
      "Nyanyanor",
      "Offinso",
      "Oyibi",
      "Santa maria",
      "Sefwi Wiawso",
      "Spintex",
      "Takoradi",
      "Tikrom",
      "West End City",
      "Other",
    ],
  },
  {
    name: "West Africa",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "west_africa",
    denominations: [
      "Burkina Faso",
      "Cape Verde",
      "Everything By Prayer Church (Nigeria)",
      "Fruitiferos Internationale (Guinea Bissau)",
      "Onction Internationale (Benin)",
      "Rencontre Prophetique Internationale (Togo)",
      "Poimen Church - Senegal",
      "Poimen Church - Gambia",
      "Guinea Conakry",
      "Chad",
      "Mali",
      "Niger",
      "Strait Gate Church (Liberia)",
      "Other",
    ],
  },
  {
    name: "UD Africa",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_africa",
    denominations: [
      "1000 Micro Church Network",
      "Bema International",
      "Double Mega Missionary Church",
      "Primeiras Obras",
      "Serious Christian Church",
      "Strong Christian Church",
      "Malawi",
      "Talanta International",
      "Primero Amor",
      "Gabon - Libreville",
      "Gabon - Port Gentil",
      "Others International",
      "Congo Brazaville",
      "Amour International",
      "Precious Souls Church - Namibia",
      "Precious Souls Church - Eswatini",
      "Central African Republic",
      "Equatorial Guinea (Malabo)",
      "Equatorial Guinea (Bata)",
      "Lesotho",
      "Seychelles",
      "Sao Tome",
      "Other",
    ],
  },
  {
    name: "UD EU",
    price: 20,
    currency: "EUR",
    currencySymbol: "€",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_europe",
    denominations: [
      "Candle In The Dark",
      "Jesus Gefunden",
      "Other",
    ],
  },
  {
    name: "UD EU - UK",
    price: 20,
    currency: "GBP",
    currencySymbol: "£",
    gateway: "stripe",
    defaultCountryCode: "+44",
    regionKey: "uk",
    denominations: [
      "Mustard Seed Chapel",
      "Pleasant Surprise Church",
      "It Is A Great Thing To Serve The Lord",
      "Other",
    ],
  },
  {
    name: "UD EU - Switzerland",
    price: 20,
    currency: "CHF",
    currencySymbol: "CHF",
    gateway: "stripe",
    defaultCountryCode: "+41",
    regionKey: "switzerland",
    denominations: ["Living Waters Church", "Other"],
  },
  {
    name: "UD North America",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+1",
    regionKey: "usa",
    denominations: [
      "American Missionary Church",
      "Laikos International Church",
      "Rejoice Greatly",
      "Revival International",
      "Other",
    ],
  },
  {
    name: "United Islands",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_world",
    denominations: [
      "Fiji",
      "Solomon Islands",
      "Papau New Guinea",
      "Favourite Child Church",
      "Vanuatu",
      "Suriname",
      "Samoa",
      "Other",
    ],
  },
  {
    name: "United Jesus",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "ghana",
    denominations: [
      "Jesus is the Door",
      "Jesus is the Answer",
      "Jesus is the Master",
      "Other",
    ],
  },
  {
    name: "Eschatos International",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_world",
    denominations: [
      "American Samoa",
      "Bangladesh",
      "Brazil",
      "Cambodia",
      "Chile",
      "Columbia",
      "Costa Rica",
      "Guyana",
      "India",
      "Jamaica",
      "La Reunion",
      "Malaysia",
      "Mauritius",
      "Middle East",
      "Morocco",
      "Nicaragua",
      "Panama",
      "Paraguay",
      "Peru",
      "Qatar",
      "Taiwan",
      "Thailand",
      "Vietnam",
      "Other",
    ],
  },
  {
    name: "Reasonable Service Church",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "ghana",
    denominations: [
      "Allos Mega Church",
      "Anointed People International",
      "Anointed Word Chapel International",
      "Glory Life Hope Center",
      "Grace Chapel Mega Church",
      "Keep My Word Chapel International",
      "Nachal Chapel Mega Church",
      "True Son Chapel International",
      "Other",
    ],
  },
  {
    name: "Affiliated Denominations",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "ghana",
    denominations: ["Other"],
  },
  {
    name: "Other",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_world",
    denominations: ["Other"],
  },
];

async function denominationsForGroup(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"registrationGroups">,
  activeOnly: boolean,
) {
  const rows = await ctx.db
    .query("registrationDenominations")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  return rows
    .filter((row) => (activeOnly ? row.active : true))
    .sort((a, b) => a.order - b.order);
}

export async function resolveGroupPricing(
  ctx: QueryCtx | MutationCtx,
  groupName: string,
): Promise<GroupPricing & { currencySymbol?: string; defaultCountryCode?: string }> {
  const group = await ctx.db
    .query("registrationGroups")
    .withIndex("by_name", (q) => q.eq("name", groupName))
    .unique();

  if (group && group.active) {
    return {
      price: group.price,
      currency: group.currency,
      gateway: group.gateway,
      regionKey: group.regionKey,
      currencySymbol: group.currencySymbol,
      defaultCountryCode: group.defaultCountryCode,
    };
  }

  return GROUP_PRICING[groupName] ?? GROUP_PRICING.Other;
}

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db.query("registrationGroups").collect();
    const active = groups
      .filter((group) => group.active)
      .sort((a, b) => a.order - b.order);

    return Promise.all(
      active.map(async (group) => {
        const denominations = await denominationsForGroup(ctx, group._id, true);
        return {
          _id: group._id,
          name: group.name,
          price: group.price,
          currency: group.currency,
          currencySymbol: group.currencySymbol,
          gateway: group.gateway,
          defaultCountryCode: group.defaultCountryCode,
          regionKey: group.regionKey,
          order: group.order,
          denominations: denominations.map((d) => ({
            _id: d._id,
            name: d.name,
            order: d.order,
          })),
        };
      }),
    );
  },
});

export const listAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "registration"]);
    const groups = await ctx.db.query("registrationGroups").collect();
    groups.sort((a, b) => a.order - b.order);

    return Promise.all(
      groups.map(async (group) => {
        const denominations = await denominationsForGroup(ctx, group._id, false);
        return {
          ...group,
          denominations,
        };
      }),
    );
  },
});

export const upsertGroup = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.optional(v.id("registrationGroups")),
    name: v.string(),
    price: v.number(),
    currency: v.string(),
    currencySymbol: v.string(),
    gateway: gatewayValidator,
    defaultCountryCode: v.string(),
    regionKey: regionKeyValidator,
    order: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required");
    if (args.price < 0) throw new Error("Price must be zero or greater");

    const duplicate = await ctx.db
      .query("registrationGroups")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (duplicate && duplicate._id !== args.id) {
      throw new Error("A group with this name already exists");
    }

    const fields = {
      name,
      price: args.price,
      currency: args.currency.trim().toUpperCase(),
      currencySymbol: args.currencySymbol.trim() || "$",
      gateway: args.gateway,
      defaultCountryCode: args.defaultCountryCode.trim() || "+",
      regionKey: args.regionKey,
      order: args.order,
      active: args.active,
    };

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Group not found");
      await ctx.db.patch(args.id, fields);
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "registration_group.updated",
        entityType: "registrationGroups",
        entityId: args.id,
        summary: `Updated registration group: ${name}`,
      });
      return args.id;
    }

    const id = await ctx.db.insert("registrationGroups", fields);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration_group.created",
      entityType: "registrationGroups",
      entityId: id,
      summary: `Created registration group: ${name}`,
    });
    return id;
  },
});

export const deleteGroup = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("registrationGroups"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Group not found");

    const denominations = await ctx.db
      .query("registrationDenominations")
      .withIndex("by_group", (q) => q.eq("groupId", args.id))
      .collect();
    for (const row of denominations) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(args.id);

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration_group.deleted",
      entityType: "registrationGroups",
      entityId: args.id,
      summary: `Deleted registration group: ${existing.name}`,
    });
  },
});

export const upsertDenomination = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.optional(v.id("registrationDenominations")),
    groupId: v.id("registrationGroups"),
    name: v.string(),
    order: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");

    const name = args.name.trim();
    if (!name) throw new Error("Denomination name is required");

    const siblings = await ctx.db
      .query("registrationDenominations")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();
    const duplicate = siblings.find(
      (row) => row.name === name && row._id !== args.id,
    );
    if (duplicate) {
      throw new Error("That denomination already exists in this group");
    }

    const fields = {
      groupId: args.groupId,
      name,
      order: args.order,
      active: args.active,
    };

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Denomination not found");
      await ctx.db.patch(args.id, fields);
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "registration_denomination.updated",
        entityType: "registrationDenominations",
        entityId: args.id,
        summary: `Updated denomination “${name}” in ${group.name}`,
      });
      return args.id;
    }

    const id = await ctx.db.insert("registrationDenominations", fields);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration_denomination.created",
      entityType: "registrationDenominations",
      entityId: id,
      summary: `Added denomination “${name}” to ${group.name}`,
    });
    return id;
  },
});

export const deleteDenomination = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("registrationDenominations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Denomination not found");
    await ctx.db.delete(args.id);

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration_denomination.deleted",
      entityType: "registrationDenominations",
      entityId: args.id,
      summary: `Deleted denomination: ${existing.name}`,
    });
  },
});

export async function syncRegistrationCatalogIfEmpty(ctx: MutationCtx) {
  const existing = await ctx.db.query("registrationGroups").first();
  if (existing) return { seeded: false as const };

  for (let i = 0; i < GROUP_SEED.length; i++) {
    const seed = GROUP_SEED[i];
    const groupId = await ctx.db.insert("registrationGroups", {
      name: seed.name,
      price: seed.price,
      currency: seed.currency,
      currencySymbol: seed.currencySymbol,
      gateway: seed.gateway,
      defaultCountryCode: seed.defaultCountryCode,
      regionKey: seed.regionKey,
      order: i,
      active: true,
    });
    for (let j = 0; j < seed.denominations.length; j++) {
      await ctx.db.insert("registrationDenominations", {
        groupId,
        name: seed.denominations[j],
        order: j,
        active: true,
      });
    }
  }

  return { seeded: true as const, groups: GROUP_SEED.length };
}

export const seedDefaults = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);

    const existing = await ctx.db.query("registrationGroups").first();
    if (existing && !args.replace) {
      return { seeded: false as const, reason: "already_exists" as const };
    }

    if (args.replace) {
      const groups = await ctx.db.query("registrationGroups").collect();
      for (const group of groups) {
        const dens = await ctx.db
          .query("registrationDenominations")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .collect();
        for (const d of dens) await ctx.db.delete(d._id);
        await ctx.db.delete(group._id);
      }
    }

    let denominationCount = 0;
    for (let i = 0; i < GROUP_SEED.length; i++) {
      const seed = GROUP_SEED[i];
      const groupId = await ctx.db.insert("registrationGroups", {
        name: seed.name,
        price: seed.price,
        currency: seed.currency,
        currencySymbol: seed.currencySymbol,
        gateway: seed.gateway,
        defaultCountryCode: seed.defaultCountryCode,
        regionKey: seed.regionKey,
        order: i,
        active: true,
      });
      for (let j = 0; j < seed.denominations.length; j++) {
        await ctx.db.insert("registrationDenominations", {
          groupId,
          name: seed.denominations[j],
          order: j,
          active: true,
        });
        denominationCount += 1;
      }
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration_catalog.seeded",
      entityType: "registrationGroups",
      summary: `Seeded ${GROUP_SEED.length} groups and ${denominationCount} denominations`,
      metadata: {
        groups: GROUP_SEED.length,
        denominations: denominationCount,
        replaced: Boolean(args.replace),
      },
    });

    return {
      seeded: true as const,
      groups: GROUP_SEED.length,
      denominations: denominationCount,
    };
  },
});

export type PublicGroup = Doc<"registrationGroups"> & {
  denominations: Doc<"registrationDenominations">[];
};
