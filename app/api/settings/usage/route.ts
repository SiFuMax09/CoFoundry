import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { usageLog } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const byTask = db
    .select({
      taskType: usageLog.taskType,
      model: usageLog.model,
      tokensIn: sql<number>`sum(${usageLog.tokensIn})`,
      tokensOut: sql<number>`sum(${usageLog.tokensOut})`,
      cacheReadTokens: sql<number>`sum(${usageLog.cacheReadTokens})`,
      costEstimate: sql<number>`sum(${usageLog.costEstimate})`,
      requestCount: sql<number>`count(*)`,
    })
    .from(usageLog)
    .where(eq(usageLog.userId, auth.user.id))
    .groupBy(usageLog.taskType, usageLog.model)
    .all();

  const totals = db
    .select({
      tokensIn: sql<number>`sum(${usageLog.tokensIn})`,
      tokensOut: sql<number>`sum(${usageLog.tokensOut})`,
      costEstimate: sql<number>`sum(${usageLog.costEstimate})`,
    })
    .from(usageLog)
    .where(eq(usageLog.userId, auth.user.id))
    .get();

  const recent = db
    .select()
    .from(usageLog)
    .where(eq(usageLog.userId, auth.user.id))
    .orderBy(desc(usageLog.createdAt))
    .limit(20)
    .all();

  return NextResponse.json({ byTask, totals, recent });
}
