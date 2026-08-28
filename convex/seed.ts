import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";
import { DEFAULT_TOUR_PACKAGES } from "./lib/tourConfig";

const FAQS = [
  {
    category: "General Event & Registration",
    question: "Who is the Mountain of the Lord/Homecoming Convention for?",
    answer:
      "The convention is for all church members and leaders from Dag Heward-Mills Ministries (DHMM) churches worldwide. This includes the United Denominations (UD) group of churches, the United Organizations (UO/First Love) group of churches, and Affiliated Denominations (AD) churches. The first Homecoming Convention was held in 1995 and resumed in 2024. The 2025 convention attracted more than 16,000 people from Ghana and 81 other nations.",
    order: 1,
  },
  {
    category: "General Event & Registration",
    question: "When and where is Homecoming 2026?",
    answer:
      "Homecoming 2026 takes place from 3-6 November 2026 at the Anagkazo Bible & Ministry Training Centre (ABMTC) campus in Mampong, Ghana. The campus has hosted the conference and other Lighthouse Chapel events for many years.",
    order: 2,
  },
  {
    category: "General Event & Registration",
    question: "What does standard registration include?",
    answer:
      "Standard registration covers your conference seat, access to every session and the impartation services, and airport transfers if you are flying in from outside Ghana. Meals and accommodation are not included and must be arranged separately.",
    order: 3,
  },
  {
    category: "General Event & Registration",
    question: "Can I register as a group?",
    answer:
      "Yes. Group registration is ticket-based. Select the required ticket quantity, provide the purchaser's contact details, choose any add-ons, and complete payment. Attendee names are not required at the time of purchase.",
    order: 4,
  },
  {
    category: "General Event & Registration",
    question: "What language is the conference in?",
    answer:
      "The primary language is English. The Lighthouse Chapel global community spans many nations, and translation arrangements have been made for major language groups in past years. If you need translation support, check with the Homecoming Secretariat closer to the event.",
    order: 5,
  },
  {
    category: "General Event & Registration",
    question: "Can I get a refund if I cannot attend?",
    answer:
      "Refund requests are handled case by case by the Homecoming Secretariat. If your plans change, contact the Secretariat with your registration details as early as possible. They will advise what may be possible based on the circumstances and timing of your request.",
    order: 6,
  },
  {
    category: "Travel Documents & Immigration",
    question: "What are the passport validity requirements for entering Ghana?",
    answer:
      "Your passport must be valid for at least six (6) months beyond your planned arrival date in Ghana.",
    order: 7,
  },
  {
    category: "Travel Documents & Immigration",
    question: "Who is required to obtain a visa before traveling to Ghana?",
    answer:
      "A Ghana visa is mandatory for international travelers except those who are ECOWAS (Economic Community of West African States) passport holders, Ghana Card holders, or holders of passports from officially visa-exempt countries. Visa requirements depend on citizenship, so check with your nearest Ghanaian embassy or consulate early; processing can take several weeks. The conference does not automatically issue invitation letters, but the Homecoming Secretariat may be able to provide one upon written request after registration is completed.",
    order: 8,
  },
  {
    category: "Travel Documents & Immigration",
    question: "What medical or vaccination documents are mandatory for entry?",
    answer:
      "You must present an official Yellow Fever vaccination certificate when entering Ghana.",
    order: 9,
  },
  {
    category: "Airport Arrival & Local Transportation",
    question:
      "Which airport do international flights arrive at, and how do I locate the welcome team?",
    answer:
      "International flights arrive at Kotoka International Airport (KIA) in Accra. Upon arrival, look for the Homecoming pop-up stand or table and official welcome team members wearing Homecoming t-shirts.",
    order: 10,
  },
  {
    category: "Airport Arrival & Local Transportation",
    question: "What luggage safety precautions should I take upon arrival?",
    answer:
      "Do not allow strangers to carry your luggage at the airport. Wait until you have identified official Homecoming personnel or authorized transport operators.",
    order: 11,
  },
  {
    category: "Airport Arrival & Local Transportation",
    question: "How do I get from the airport to the Anagkazo Campus?",
    answer:
      "Shuttle service: Sign up for the round-trip shuttle service between the airport and the Anagkazo Campus for a nominal fee. The service will operate from Monday, November 2, through Saturday, November 7 at scheduled times. Please note that the shuttle service is not available to transport individual homes. This option is especially convenient for those arriving in the evening who prefer to travel with a group. Alternatively, you may use Uber or Bolt and share the cost (approx. GHC 200) with other attendees.",
    order: 12,
  },
  {
    category: "Airport Arrival & Local Transportation",
    question: "What transportation is recommended for short trips?",
    answer:
      "Uber and Bolt are recommended for short trips. Some drivers may request cash, but in-app electronic payment is recommended whenever possible.",
    order: 13,
  },
  {
    category: "Airport Arrival & Local Transportation",
    question:
      "What are the internal transport options and gate fees on the ABMTC campus?",
    answer:
      "Gate fee: Every vehicle entering the ABMTC campus must pay GHC 20 per entry. Internal transport: Anagkazo tricycle taxis operate within the campus at a fixed cost of GHC 5 per ride.",
    order: 14,
  },
  {
    category: "Accommodation, Weather & Packing",
    question: "How do I book accommodation, and what options are available?",
    answer:
      "Accommodation is booked separately after registration and is confirmed on a first-come, first-served basis. Options include on-campus housing — hostels, condominiums, and apartments — as well as preferred commercial hotels near the ABMTC campus. The on-campus hostel rate is USD 30. Delegates choosing commercial hotels should consult their denomination leaders for the applicable external hotel booking arrangements.",
    order: 15,
  },
  {
    category: "Accommodation, Weather & Packing",
    question: "What must I bring if I am staying in a campus hostel?",
    answer:
      "Bring your own linens, pillows, towels, and tissue paper, as these personal items may not be provided in hostel rooms.",
    order: 16,
  },
  {
    category: "Accommodation, Weather & Packing",
    question: "What weather should I expect, and how should I pack?",
    answer:
      "Temperatures are expected to range from 22°C to 32°C (73°F to 91°F), with rainfall and occasional thunderstorms. Pack modest, summer-appropriate clothes and comfortable footwear; sneakers are recommended. Bring a light jacket or sweater for cool mornings and nights. Carry an umbrella or raincoat, a wide-brimmed hat, sunglasses, and a hand fan for rain and sun protection.",
    order: 17,
  },
  {
    category: "Accommodation, Weather & Packing",
    question: "What electrical plugs and accessories are required?",
    answer:
      "ABMTC uses 3-pin UK-style electrical sockets. Bring an international power adapter, device chargers, and a portable power bank for long sessions and mobile connectivity.",
    order: 18,
  },
  {
    category: "Event Schedule, Meetings & Code of Conduct",
    question: "Where will the primary meeting sessions and tours take place?",
    answer:
      "All main sessions will take place at ABMTC in Mampong. Specific halls or grounds for breakout sessions will be announced during the event.",
    order: 19,
  },
  {
    category: "Event Schedule, Meetings & Code of Conduct",
    question: "What are the rules for attendance and start times?",
    answer:
      "All registered delegates are required to attend every scheduled session and organized tour punctually. Start times for upcoming sessions will be announced at the close of each preceding session.",
    order: 20,
  },
  {
    category: "Event Schedule, Meetings & Code of Conduct",
    question: "How will updates and session locations be communicated?",
    answer:
      "Join and regularly check the dedicated Homecoming WhatsApp platform for your denomination. It will provide real-time notices, hall assignments, and t-shirt schedules.",
    order: 21,
  },
  {
    category: "Event Schedule, Meetings & Code of Conduct",
    question: "What should attendees bring to daily meetings?",
    answer:
      "Bring a plastic or reusable water bottle for hydration; a tablet, Bible, and note-taking device or materials; sunglasses, a hat, a hand fan, and rainwear such as an umbrella or raincoat; and official t-shirts as directed by your group leaders for the days and times they should be worn.",
    order: 22,
  },
  {
    category: "Finances, Mobile Connectivity & Dining",
    question: "What is Ghana's currency, and where can I exchange money?",
    answer:
      "The local currency is the Ghana Cedi (GHC). The estimated exchange rate is approximately USD 1 to GHC 11-13. Official foreign exchange (Forex) bureaus will be available on the ABMTC campus. Convert enough cash for vendor purchases.",
    order: 23,
  },
  {
    category: "Finances, Mobile Connectivity & Dining",
    question: "What should I know about payments, credit cards, and market purchases?",
    answer:
      "Ghana primarily uses cash, although Mobile Money (MoMo) is widely used locally. Visa and Mastercard are accepted at major hotels and corporate chain stores but rarely by informal vendors. Haggling is customary in open markets; a common rule of thumb is to begin at one-third of the vendor's initial asking price.",
    order: 24,
  },
  {
    category: "Finances, Mobile Connectivity & Dining",
    question: "How can international attendees access mobile networks and data?",
    answer:
      "Purchase a local SIM card from mobile network representatives stationed on the ABMTC campus, enable international roaming through your home network provider, or use a digital roaming eSIM application such as Roamless.",
    order: 25,
  },
  {
    category: "Finances, Mobile Connectivity & Dining",
    question: "How much do meals cost, and where can food be purchased?",
    answer:
      "A standard local meal costs approximately GHC 30 (about USD 2). Food courts with independent vendors will operate at several campus locations. Some hotels offer complimentary or paid breakfast; carry light, non-perishable snacks. Daily catered VIP meals will also be available for a nominal fee at God's Banquet Hall on the Anagkazo campus. Jesus Banquets Hall provides food for purchase as an onsite restaurant.",
    order: 26,
  },
  {
    category: "Health, Hygiene & Personal Security",
    question: "What water-consumption rules apply on campus and in Ghana?",
    answer:
      "Drink only commercially bottled water. Do not drink tap water or sachet water. Sachet water is strictly prohibited on the ABMTC campus.",
    order: 27,
  },
  {
    category: "Health, Hygiene & Personal Security",
    question: "What safety and security protocols must delegates follow?",
    answer:
      "Keep your physical passport with you at all times. Do not walk alone, especially at night, and never accept rides from strangers. Keep your assigned pastors or shepherds informed of your whereabouts. Closely monitor phones, tablets, and other devices, even inside chapel buildings. Avoid using your phone absentmindedly in public spaces. Where possible, lock your valuables in your suitcase when left unattended.",
    order: 28,
  },
  {
    category: "Health, Hygiene & Personal Security",
    question: "What personal health items and medications should I bring?",
    answer:
      "Bring enough prescription medication for your stay, together with anti-malarial tablets and mosquito repellent; painkillers, antacids, and anti-diarrheal medication; sunscreen and toiletries including soap, lotion, toothpaste, and a toothbrush. Wash your hands frequently and consume only hot, thoroughly cooked food.",
    order: 29,
  },
];

async function syncFaqs(ctx: MutationCtx) {
  const existing = await ctx.db.query("faqs").collect();
  for (const faq of existing) {
    await ctx.db.delete(faq._id);
  }
  for (const faq of FAQS) {
    await ctx.db.insert("faqs", faq);
  }
}

async function syncDefaultTourPackages(ctx: MutationCtx) {
  const now = Date.now();
  for (const pkg of DEFAULT_TOUR_PACKAGES) {
    const existing = await ctx.db
      .query("tourPackages")
      .withIndex("by_slug", (q) => q.eq("slug", pkg.slug))
      .first();
    if (existing) continue;
    await ctx.db.insert("tourPackages", {
      slug: pkg.slug,
      label: pkg.label,
      dateLabel: pkg.dateLabel,
      timeRange: pkg.timeRange,
      sites: pkg.sites,
      meals: pkg.meals,
      priceUsd: pkg.priceUsd,
      imageUrl: pkg.imageUrl,
      badge: pkg.badge,
      active: true,
      order: pkg.order,
      updatedAt: now,
    });
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
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);

    await syncFaqs(ctx);
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

    await syncDefaultTourPackages(ctx);

    const existingAnnouncement = await ctx.db.query("announcements").first();
    if (!existingAnnouncement) {
      await ctx.db.insert("announcements", {
        title: "Registration Now Open",
        body: "Register early for Mountain of the Lord — The Homecoming, November 2–8, 2026 at Anagkazo Campus, Mampong, Ghana.",
        active: true,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const seedPublic = mutation({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);

    const existingFaqs = await ctx.db.query("faqs").first();
    if (existingFaqs) {
      return { success: true, message: "Already seeded" };
    }

    await syncFaqs(ctx);
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
    await syncDefaultTourPackages(ctx);
    await ctx.db.insert("announcements", {
      title: "Registration Now Open",
      body: "Register early for Mountain of the Lord — The Homecoming, November 2–8, 2026 at Anagkazo Campus, Mampong, Ghana.",
      active: true,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const syncHomecomingMessagesPublic = mutation({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    await syncHomecomingMessages(ctx);
    return { success: true };
  },
});

/** Replace all FAQs with the current Homecoming 2026 FAQ seed set. */
export const replaceFaqs = mutation({
  args: {},
  handler: async (ctx) => {
    await syncFaqs(ctx);
    return { success: true, count: FAQS.length };
  },
});
