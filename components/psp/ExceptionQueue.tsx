"use client";
import Link from "next/link";
import { useState } from "react";
import type { ExceptionKind, PspException } from "@/lib/psp/exceptionQueue";
import { formatPspTime } from "./Common";
const labels: Record<ExceptionKind, string> = {
  overdue_questionnaire: "问卷逾期",
  failed_contact: "联系未成功",
  pending_review: "待医生复核",
  education_help: "教育需帮助",
};
const actions: Record<ExceptionKind, string> = {
  overdue_questionnaire: "核对问卷并跟进",
  failed_contact: "进入联系记录",
  pending_review: "进入医生复核",
  education_help: "核对教育跟进",
};
export function ExceptionQueue({
  rows,
  serverNow,
  role,
  locked,
}: {
  rows: PspException[];
  serverNow: string;
  role: string;
  locked: boolean;
}) {
  const [kind, setKind] = useState("all");
  const [own, setOwn] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const filtered = rows.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (!own || r.responsibleRole === role) &&
      (!overdue || r.overdue),
  );
  return (
    <section
      aria-label="待处理事项"
      className="ui-panel space-y-4"
    >
      <h2 className="font-semibold">待处理事项（{rows.length}）</h2>
      <p className="text-sm text-gray-600">
        当前运营待办，截至 {formatPspTime(serverNow)}
        （上海时间）。同一患者可能有多项待办；条数不是患者人数或月报分母。固定快照与当前待办用途不同。
      </p>
      <div className="exception-filters flex flex-wrap gap-4 text-sm">
        <label>
          事项类型{" "}
          <select
            aria-label="事项类型"
            className="rounded border p-2"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">全部</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={own}
            onChange={(e) => setOwn(e.target.checked)}
          />{" "}
          与当前角色相关
        </label>
        <label>
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
          />{" "}
          仅看逾期
        </label>
      </div>
      {!filtered.length && (
        <p role="status">
          {rows.length ? "当前筛选下没有事项" : "当前无待处理事项"}
        </p>
      )}
      {filtered.map((r) => (
        <article
          key={r.id}
          className="grid gap-2 border-t border-gray-200 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
        >
          <div>
            <h3 className="font-semibold">{r.displayName}</h3>
            <p>
              {labels[r.kind]} ·{" "}
              {!r.dueAt ? "期限未知" : r.overdue ? "已逾期" : "未逾期"}
            </p>
            <p>
              责任角色：{r.responsibleRole === "doctor" ? "医生" : "个案管理师"}
            </p>
          </div>
          <div className="min-w-0 space-y-2 break-words">
            <p>{r.reason}</p>
            <p>
              {r.dueAt
                ? `期限：${formatPspTime(r.dueAt)}`
                : r.kind === "pending_review"
                  ? "尚未设定复核时限"
                  : "尚未设定期限"}
            </p>
            <p>事实时间：{formatPspTime(r.sourceAt)}</p>
            {r.blockedReason && <p>{r.blockedReason}</p>}
            {r.blockedReason || locked ? (
              <p aria-disabled="true">
                {locked
                  ? "操作待确认，请先完成当前操作或原请求重试"
                  : "当前受阻，仅保留事实核对"}
              </p>
            ) : (
              <>
                <Link className="text-pink-700 underline" href={r.target.href}>
                  {actions[r.kind]}
                </Link>
                {r.additionalTargets.map((t) => (
                  <Link
                    className="ml-3 inline-block break-all text-pink-700 underline"
                    key={`${t.kind}:${t.id}`}
                    href={t.href}
                  >
                    关联{t.kind === "alert" ? "预警" : "计划"}：{t.id}
                  </Link>
                ))}
              </>
            )}
            {r.verificationTarget && !locked && (
              <Link
                className="block text-pink-700 underline"
                href={r.verificationTarget.href}
              >
                只读核对来源／跟进计划
              </Link>
            )}
            {r.correctionHref && !locked && (
              <Link
                className="block text-pink-700 underline"
                href={r.correctionHref}
              >
                核对补录证据
              </Link>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
