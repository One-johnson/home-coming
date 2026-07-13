import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireRole } from "./users";

const FAQS = [
  {
    category: "Registration",
    question: "What are the registration deadlines?",
    answer:
      "Registration is open until capacity is reached. We encourage early registration to secure your spot and preferred accommodation.",
    order: 1,
  },
  {
    category: "Registration",
    question: "Can I register as a group?",
    answer:
      "Yes. Group registration is ticket-based. Select your ticket quantity, provide purchaser contact details, choose add-ons, and complete payment. Attendee names are not required at purchase.",
    order: 2,
  },
  {
    category: "Payments",
    question: "What currencies and payment methods are accepted?",
    answer:
      "Ghana and West Africa pay in GHS via Paystack. Rest of Africa pays in USD via Paystack. USA, Canada, Switzerland, UK, Europe, and the rest of the world use PayPal in their respective currencies.",
    order: 3,
  },
  {
    category: "Accommodation",
    question: "What accommodation options are available?",
    answer:
      "Attendees can book campus housing (condos, hostels, apartments) or choose from our list of preferred hotels near Anagkazo Campus.",
    order: 4,
  },
  {
    category: "Travel",
    question: "Do I need a visa to travel to Ghana?",
    answer:
      "International attendees should check Ghana visa requirements for their country of residence. Plan your travel early and allow time for visa processing if required.",
    order: 5,
  },
  {
    category: "Venue",
    question: "What meals are provided at the campus?",
    answer:
      "Meal arrangements will be communicated closer to the event. VIP Meals and Ministers Grill add-ons are available during registration.",
    order: 6,
  },
  {
    category: "Support",
    question: "Who can I contact for help?",
    answer:
      "Email homecomingisback@gmail.com for registration, accommodation, and travel support.",
    order: 7,
  },
];

const STATS = [
  { label: "Attendees", value: "5000+", order: 1 },
  { label: "Countries Represented", value: "100+", order: 2 },
  { label: "Sessions", value: "8+", order: 3 },
  { label: "Testimonies", value: "50+", order: 4 },
];

async function syncStats(ctx: MutationCtx) {
  for (const stat of STATS) {
    const existing = await ctx.db
      .query("stats")
      .withIndex("by_order", (q) => q.eq("order", stat.order))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, stat);
    } else {
      await ctx.db.insert("stats", stat);
    }
  }
}

async function syncHomecomingMessages(ctx: MutationCtx) {
  const existing = await ctx.db.query("messages").collect();
  for (const message of existing) {
    await ctx.db.delete(message._id);
  }

  for (const message of MESSAGES) {
    await ctx.db.insert("messages", message);
  }
}

const HOTELS = [
  { name: "Cactus Creek Hotel", order: 1 },
  { name: "Aruba Hotel", order: 2 },
  { name: "Hillburi Hotel", order: 3 },
  { name: "Peduase Lodge", order: 4 },
];

const GALLERIES = [
  { year: 2025, theme: "The Homecoming", title: "Homecoming 2025 Highlights" },
];

const MESSAGES = [
  {
    year: 2025,
    title:
      "Rose Of Sharon, Lily Of The Valley Homecoming Convention 2025 || Dag Heward-Mills. D2S1 5th Nov 2025",
    speaker: "Dag Heward-Mills",
    mediaType: "video" as const,
    url: "https://www.youtube.com/watch?v=o8OBRm2ep34",
    order: 1,
  },
  {
    year: 2025,
    title:
      "Rose Of Sharon, Lily Of The Valley Homecoming Convention 2025 || Dag Heward-Mills. D2S2 5th Nov 2025",
    speaker: "Dag Heward-Mills",
    mediaType: "video" as const,
    url: "https://www.youtube.com/watch?v=XA8ezzSao2M",
    order: 2,
  },
  {
    year: 2025,
    title:
      "Rose Of Sharon, Lily Of The Valley Homecoming Convention 2025 || Dag Heward-Mills. D3S1 6th Nov 2025",
    speaker: "Dag Heward-Mills",
    mediaType: "video" as const,
    url: "https://www.youtube.com/watch?v=Zf8kuxs1Ngk",
    order: 3,
  },
  {
    year: 2025,
    title:
      "Rose Of Sharon, Lily Of The Valley Homecoming Convention 2025 || Dag Heward-Mills. D3S2 6th Nov 2025",
    speaker: "Dag Heward-Mills",
    mediaType: "video" as const,
    url: "https://www.youtube.com/watch?v=EHCbo0Bh0xk",
    order: 4,
  },
  {
    year: 2025,
    title:
      "Rose Of Sharon, Lily Of The Valley Homecoming Convention 2025 || Dag Heward-Mills. D4S1 7th Nov 2025",
    speaker: "Dag Heward-Mills",
    mediaType: "video" as const,
    url: "https://www.youtube.com/watch?v=txFJjouCEYg",
    order: 5,
  },
  {
    year: 2025,
    title:
      "Rose Of Sharon, Lily Of The Valley Homecoming Convention 2025 || Dag Heward-Mills. D4S2 7th Nov 2025",
    speaker: "Dag Heward-Mills",
    mediaType: "video" as const,
    url: "https://www.youtube.com/watch?v=Eam4GpMMM7c",
    order: 6,
  },
];

const HOUSING = [
  {
    type: "condo" as const,
    pricePerStay: 10,
    capacityLimit: 2000,
    booked: 0,
    notes: "Confirm availability and allocation rules.",
  },
  {
    type: "hostel" as const,
    pricePerStay: 25,
    capacityLimit: 600,
    booked: 0,
    notes: "Confirm room capacity and gender-specific allocation rules.",
  },
  {
    type: "apartment" as const,
    pricePerStay: 150,
    capacityLimit: 30,
    booked: 0,
    notes: "Confirm availability and allocation rules.",
  },
];

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin"]);

    const existingFaqs = await ctx.db.query("faqs").first();
    if (!existingFaqs) {
      for (const faq of FAQS) {
        await ctx.db.insert("faqs", faq);
      }
    }

    await syncStats(ctx);
    await syncHomecomingMessages(ctx);

    const existingHotels = await ctx.db.query("hotels").first();
    if (!existingHotels) {
      for (const hotel of HOTELS) {
        await ctx.db.insert("hotels", {
          ...hotel,
          contact: "Details coming soon",
          rate: "Rates to be confirmed",
          distance: "Distance to be confirmed",
          instructions: "Booking instructions will be updated by the event team.",
        });
      }
    }

    const existingGalleries = await ctx.db.query("galleries").first();
    if (!existingGalleries) {
      for (const gallery of GALLERIES) {
        const galleryId = await ctx.db.insert("galleries", gallery);
        for (let i = 0; i < 4; i++) {
          await ctx.db.insert("galleryImages", {
            galleryId,
            imageUrl: `https://picsum.photos/seed/homecoming-${gallery.year}-${i}/800/600`,
            caption: `${gallery.title} — Photo ${i + 1}`,
            order: i,
          });
        }
      }
    }

    const existingHousing = await ctx.db.query("housing").first();
    if (!existingHousing) {
      for (const unit of HOUSING) {
        await ctx.db.insert("housing", unit);
      }
    }

    const existingAbout = await ctx.db.query("aboutContent").first();
    if (!existingAbout) {
      await ctx.db.insert("aboutContent", {
        slug: "about",
        history:
          "The Homecoming Convention began as a gathering of believers returning to the mountain — a place of encounter, worship, and renewal. Each year, thousands from across the globe come together at Anagkazo Campus in Mampong, Ghana.",
        purpose:
          "To gather God's people for worship, teaching, fellowship, and spiritual impartation under the ministry of Dag Heward-Mills.",
        vision:
          "A global homecoming where nations are represented, lives are transformed, and the presence of God is experienced on the mountain.",
        impact:
          "Past conventions have seen attendees from dozens of nations, powerful testimonies, and lasting ministry connections formed across continents.",
        firstLadyMessage:
          "Welcome to The Homecoming. This is more than an event — it is a family reunion on the mountain. We look forward to welcoming you to Anagkazo Campus with open arms and grateful hearts.",
        updatedAt: Date.now(),
      });
    }

    const existingAnnouncement = await ctx.db.query("announcements").first();
    if (!existingAnnouncement) {
      await ctx.db.insert("announcements", {
        title: "Registration Now Open",
        body: "Register early for Mountain of the Lord — The Homecoming, November 3–8, 2026 at Anagkazo Campus, Mampong, Ghana.",
        active: true,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const seedPublic = mutation({
  args: {},
  handler: async (ctx) => {
    const existingFaqs = await ctx.db.query("faqs").first();
    if (existingFaqs) {
      return { success: true, message: "Already seeded" };
    }

    for (const faq of FAQS) {
      await ctx.db.insert("faqs", faq);
    }
    await syncStats(ctx);
    for (const hotel of HOTELS) {
      await ctx.db.insert("hotels", {
        ...hotel,
        contact: "Details coming soon",
        rate: "Rates to be confirmed",
        distance: "Distance to be confirmed",
        instructions: "Booking instructions will be updated by the event team.",
      });
    }
    for (const gallery of GALLERIES) {
      const galleryId = await ctx.db.insert("galleries", gallery);
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("galleryImages", {
          galleryId,
          imageUrl: `https://picsum.photos/seed/homecoming-${gallery.year}-${i}/800/600`,
          caption: `${gallery.title} — Photo ${i + 1}`,
          order: i,
        });
      }
    }
    for (const message of MESSAGES) {
      await ctx.db.insert("messages", message);
    }
    for (const unit of HOUSING) {
      await ctx.db.insert("housing", unit);
    }
    await ctx.db.insert("aboutContent", {
      slug: "about",
      history:
        "The Homecoming Convention began as a gathering of believers returning to the mountain — a place of encounter, worship, and renewal. Each year, thousands from across the globe come together at Anagkazo Campus in Mampong, Ghana.",
      purpose:
        "To gather God's people for worship, teaching, fellowship, and spiritual impartation under the ministry of Dag Heward-Mills.",
      vision:
        "A global homecoming where nations are represented, lives are transformed, and the presence of God is experienced on the mountain.",
      impact:
        "Past conventions have seen attendees from dozens of nations, powerful testimonies, and lasting ministry connections formed across continents.",
      firstLadyMessage:
        "Welcome to The Homecoming. This is more than an event — it is a family reunion on the mountain. We look forward to welcoming you to Anagkazo Campus with open arms and grateful hearts.",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("announcements", {
      title: "Registration Now Open",
      body: "Register early for Mountain of the Lord — The Homecoming, November 3–8, 2026 at Anagkazo Campus, Mampong, Ghana.",
      active: true,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const syncStatsPublic = mutation({
  args: {},
  handler: async (ctx) => {
    await syncStats(ctx);
    return { success: true };
  },
});

export const syncHomecomingMessagesPublic = mutation({
  args: {},
  handler: async (ctx) => {
    await syncHomecomingMessages(ctx);
    return { success: true };
  },
});
