import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ADMINS = [
  { name: "Admin One", email: "admin1@sentr.hr", password: "changeme123" },
  { name: "Admin Two", email: "admin2@sentr.hr", password: "changeme123" },
];

async function main() {
  for (const admin of ADMINS) {
    const existing = await db.user.findUnique({ where: { email: admin.email } });
    if (existing) {
      console.log(`Skipped (exists): ${admin.email}`);
      continue;
    }
    const hashedPassword = await bcrypt.hash(admin.password, 12);
    await db.user.create({
      data: { name: admin.name, email: admin.email, password: hashedPassword },
    });
    console.log(`Created: ${admin.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
