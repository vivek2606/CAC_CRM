import { PrismaClient, LeadStatus, LeadSource, DealStage, ActivityType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444"];

const INDUSTRIES = ["SaaS", "Manufacturing", "Healthcare", "Retail", "Finance", "Logistics", "Education", "Real Estate"];
const CITIES = ["Mumbai", "Bengaluru", "Delhi", "Pune", "Hyderabad", "Chennai", "Gurugram", "Kolkata"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  // 1. Head of Sales
  const head = await prisma.user.create({
    data: {
      name: "Arjun Mehta",
      email: "head@caccrm.com",
      passwordHash,
      role: "HEAD",
      title: "Head of Sales",
      phone: "+91 98200 11111",
      avatarColor: "#4f46e5",
    },
  });

  // 2. Six Sales Managers reporting to the Head
  const salesManagerNames = [
    { name: "Priya Sharma", email: "priya@caccrm.com" },
    { name: "Rohan Verma", email: "rohan@caccrm.com" },
    { name: "Ananya Iyer", email: "ananya@caccrm.com" },
    { name: "Karan Kapoor", email: "karan@caccrm.com" },
    { name: "Sneha Reddy", email: "sneha@caccrm.com" },
    { name: "Vikram Singh", email: "vikram@caccrm.com" },
  ];

  const managers = [];
  for (let i = 0; i < salesManagerNames.length; i++) {
    const m = salesManagerNames[i];
    const user = await prisma.user.create({
      data: {
        name: m.name,
        email: m.email,
        passwordHash,
        role: "SALES_MANAGER",
        title: "Sales Manager",
        phone: `+91 98${randomInt(10000000, 99999999)}`,
        avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        managerId: head.id,
      },
    });
    managers.push(user);
  }

  console.log(`Created ${managers.length + 1} users.`);

  const allOwners = [...managers]; // demo data owned by reps, head oversees

  // 3. Accounts (companies) - a handful per rep
  const companySuffixes = ["Technologies", "Industries", "Solutions", "Systems", "Enterprises", "Global", "Labs", "Group"];
  const companyRoots = [
    "Nimbus", "Vertex", "Orbit", "Zenith", "Quantum", "Silverline", "Bluewave", "Ironclad",
    "Northstar", "Crestline", "Falcon", "Meridian", "Summit", "Pioneer", "Catalyst", "Horizon",
    "Redwood", "Skyline", "Anchor", "Pinnacle", "Frontier", "Beacon", "Cobalt", "Sterling",
  ];

  const accounts = [];
  for (const root of companyRoots) {
    const owner = pick(allOwners);
    const account = await prisma.account.create({
      data: {
        name: `${root} ${pick(companySuffixes)}`,
        industry: pick(INDUSTRIES),
        website: `https://www.${root.toLowerCase()}.com`,
        phone: `+91 ${randomInt(70000, 99999)} ${randomInt(10000, 99999)}`,
        city: pick(CITIES),
        country: "India",
        ownerId: owner.id,
      },
    });
    accounts.push(account);
  }
  console.log(`Created ${accounts.length} accounts.`);

  // 4. Contacts for each account
  const firstNames = ["Aman", "Riya", "Devansh", "Ishita", "Kabir", "Meera", "Nikhil", "Pooja", "Rahul", "Simran", "Tarun", "Uma", "Varun", "Yamini"];
  const lastNames = ["Agarwal", "Bose", "Chatterjee", "Desai", "Ghosh", "Joshi", "Khanna", "Malhotra", "Nair", "Pillai", "Rao", "Saxena", "Trivedi"];

  const contacts = [];
  for (const account of accounts) {
    const contactCount = randomInt(1, 2);
    for (let i = 0; i < contactCount; i++) {
      const firstName = pick(firstNames);
      const lastName = pick(lastNames);
      const contact = await prisma.contact.create({
        data: {
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${account.name.split(" ")[0].toLowerCase()}.com`,
          phone: `+91 ${randomInt(70000, 99999)} ${randomInt(10000, 99999)}`,
          jobTitle: pick(["CEO", "VP Sales", "Procurement Head", "CTO", "Operations Manager", "COO"]),
          ownerId: account.ownerId,
          accountId: account.id,
        },
      });
      contacts.push(contact);
    }
  }
  console.log(`Created ${contacts.length} contacts.`);

  // 5. Leads - mix of open and converted
  const leadTitles = [
    "Enterprise plan inquiry", "Interested in bulk pricing", "Requesting product demo",
    "Looking for CRM replacement", "RFP submission", "Renewal discussion",
    "Expansion to new region", "Integration requirements", "Trial to paid upgrade",
    "Referral from existing client",
  ];

  const leadStatuses: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"];
  const leadSources: LeadSource[] = ["WEBSITE", "REFERRAL", "COLD_CALL", "EMAIL_CAMPAIGN", "SOCIAL_MEDIA", "EVENT", "PARTNER"];

  const openLeads = [];
  for (let i = 0; i < 30; i++) {
    const account = pick(accounts);
    const accountContacts = contacts.filter((c) => c.accountId === account.id);
    const lead = await prisma.lead.create({
      data: {
        title: pick(leadTitles),
        company: account.name,
        status: pick(leadStatuses),
        source: pick(leadSources),
        value: randomInt(50000, 2000000),
        email: accountContacts[0]?.email ?? null,
        phone: accountContacts[0]?.phone ?? null,
        ownerId: account.ownerId,
        accountId: account.id,
        contactId: accountContacts[0]?.id ?? null,
        createdAt: daysFromNow(-randomInt(1, 60)),
      },
    });
    openLeads.push(lead);
  }
  console.log(`Created ${openLeads.length} open leads.`);

  // 6. Deals across the pipeline - some created directly, some from converted leads
  const dealStages: DealStage[] = ["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION"];
  const stageProbability: Record<string, number> = {
    QUALIFICATION: 20,
    NEEDS_ANALYSIS: 40,
    PROPOSAL: 60,
    NEGOTIATION: 80,
    WON: 100,
    LOST: 0,
  };
  const lostReasons = ["Budget constraints", "Chose a competitor", "Project cancelled", "No response / went cold", "Timing not right"];

  const dealCount = 45;
  for (let i = 0; i < dealCount; i++) {
    const account = pick(accounts);
    const accountContacts = contacts.filter((c) => c.accountId === account.id);
    // weight distribution: open pipeline stages, plus won/lost history
    const roll = Math.random();
    let stage: DealStage;
    let closedAt: Date | null = null;
    let lostReason: string | null = null;
    if (roll < 0.55) {
      stage = pick(dealStages);
    } else if (roll < 0.8) {
      stage = "WON";
      closedAt = daysFromNow(-randomInt(1, 90));
    } else {
      stage = "LOST";
      closedAt = daysFromNow(-randomInt(1, 90));
      lostReason = pick(lostReasons);
    }

    await prisma.deal.create({
      data: {
        title: `${account.name} - ${pick(["New Business", "Expansion", "Upsell", "Renewal"])}`,
        stage,
        value: randomInt(100000, 3000000),
        probability: stageProbability[stage],
        expectedCloseDate: stage === "WON" || stage === "LOST" ? null : daysFromNow(randomInt(5, 60)),
        closedAt,
        lostReason,
        ownerId: account.ownerId,
        accountId: account.id,
        contactId: accountContacts[0]?.id ?? null,
        createdAt: daysFromNow(-randomInt(5, 120)),
      },
    });
  }
  console.log(`Created ${dealCount} deals.`);

  // 7. Activities - calls, meetings, emails, tasks tied to leads/deals
  const allLeads = await prisma.lead.findMany();
  const allDeals = await prisma.deal.findMany();
  const activityTypes: ActivityType[] = ["CALL", "EMAIL", "MEETING", "TASK"];
  const subjectsByType: Record<string, string[]> = {
    CALL: ["Discovery call", "Follow-up call", "Pricing discussion call", "Check-in call"],
    EMAIL: ["Sent proposal", "Follow-up email", "Introduction email", "Contract sent"],
    MEETING: ["Product demo", "Stakeholder meeting", "Negotiation meeting", "Kickoff meeting"],
    TASK: ["Prepare proposal document", "Send contract for signature", "Internal pricing approval", "Update CRM records"],
  };

  let activityCount = 0;
  for (const deal of allDeals) {
    const numActivities = randomInt(1, 4);
    for (let i = 0; i < numActivities; i++) {
      const type = pick(activityTypes);
      const isPast = Math.random() < 0.6;
      await prisma.activity.create({
        data: {
          type,
          subject: pick(subjectsByType[type]),
          description: null,
          dueAt: isPast ? daysFromNow(-randomInt(1, 30)) : daysFromNow(randomInt(1, 21)),
          completedAt: isPast ? daysFromNow(-randomInt(1, 30)) : null,
          status: isPast ? "COMPLETED" : "PENDING",
          ownerId: deal.ownerId,
          dealId: deal.id,
          contactId: deal.contactId,
        },
      });
      activityCount++;
    }
  }

  for (const lead of allLeads.slice(0, 20)) {
    const type = pick(activityTypes);
    const isPast = Math.random() < 0.5;
    await prisma.activity.create({
      data: {
        type,
        subject: pick(subjectsByType[type]),
        dueAt: isPast ? daysFromNow(-randomInt(1, 20)) : daysFromNow(randomInt(1, 14)),
        completedAt: isPast ? daysFromNow(-randomInt(1, 20)) : null,
        status: isPast ? "COMPLETED" : "PENDING",
        ownerId: lead.ownerId,
        leadId: lead.id,
        contactId: lead.contactId,
      },
    });
    activityCount++;
  }
  console.log(`Created ${activityCount} activities.`);

  // 8. A few notes
  let noteCount = 0;
  for (const deal of allDeals.slice(0, 15)) {
    await prisma.note.create({
      data: {
        body: pick([
          "Client is comparing us with two other vendors, price sensitivity is high.",
          "Decision maker is happy with the demo, waiting on legal review.",
          "Need to loop in technical team for integration questions.",
          "Budget approved for this quarter, aiming to close before month end.",
          "Requested case studies from similar industry clients.",
        ]),
        authorId: deal.ownerId,
        dealId: deal.id,
      },
    });
    noteCount++;
  }
  console.log(`Created ${noteCount} notes.`);

  console.log("\nSeed complete!\n");
  console.log("Login credentials (all users, password: password123):");
  console.log(`  Head of Sales:  ${head.email}`);
  managers.forEach((m) => console.log(`  Sales Manager:  ${m.email}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
