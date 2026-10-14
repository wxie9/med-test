import { toolFacts } from "./evidence";
import { RESEARCH_BOUNDARY } from "./templates";
import type { ToolCallRecord } from "./types";

const ADJUSTMENT = /停药|停用|停服|停掉|停止(?:服用|用药|治疗)|减量|减药|减半|半片|半粒|减少(?:剂量|用量)|调整(?:药量|用量|剂量|用药)|换药|少打|少吃|跳过|漏服|推迟|暂停|中断治疗|治疗延期|不吃(?:药|来曲唑|阿那曲唑|依西美坦)|不打|不服(?:药|用)|隔天(?:吃|服用|用药)|不用(?:药|来曲唑|阿那曲唑|依西美坦)|无需(?:继续)?(?:服药|服用|用药)|不必(?:继续)?(?:服药|服用|用药)/;
const MEDICATION = /药|来曲唑|阿那曲唑|依西美坦|化疗|输液|打针/;
const PROHIBITION = /^(?:请您|请|您|你)?(?:不要|不可以|不能|不可|不应|不建议|切勿|请勿|避免|别)/;
// Negating continued taking instructs discontinuation; negating stopping prohibits
// discontinuation. Check this before the safe-prohibition allowance below.
const NEGATIVE_TAKING = "(?:不要|别|不建议|不需要|无需|不必|不用|不应|不宜|禁止|避免|不能|不可(?:以)?|勿|不)(?:您|你)?(?:自行|擅自|自己)?(?:暂时)?(?:再继续|继续|再|恢复)?";
const NEGATED_CONTINUATION = new RegExp(`${NEGATIVE_TAKING}(?:服用|服药|用药|打针|输液|接受治疗|(?:药物)?治疗)`);
const NEGATED_SHORT_TAKING = new RegExp(`${NEGATIVE_TAKING}(吃|服|用)`);
/**
 * Fail closed for adjustment language except a narrow, explicit prohibition or a
 * requirement for clinician confirmation. This is a conservative wording boundary,
 * not a general natural-language medical entailment classifier.
 */
export function permitsMedicationAdjustment(text: string): boolean {
  for (const part of text.normalize("NFKC").split(/[。！？；，\n]|但是|不过|然而|但|却|也可以|并且可以/)) {
    const clause = part.trim();
    if (NEGATED_CONTINUATION.test(clause)) return true;
    const taking = NEGATED_SHORT_TAKING.exec(clause);
    if (taking) {
      const object = clause.slice(taking.index + taking[0].length);
      const eatingFood = taking[1] === "吃" && /食物|食品|饭|蔬菜|水果|辛辣|油腻/.test(object) && !MEDICATION.test(object);
      const takingMedication = MEDICATION.test(clause) || (taking[1] === "服" && !/^(?:从|气|输|饰|务)/.test(object));
      if (takingMedication && !eatingFood) return true;
    }
    if (!ADJUSTMENT.test(clause) && !(MEDICATION.test(clause) && /停|减|换|中断|延后|延迟|延期/.test(clause))) continue;
    if (/不是|并非|并不|无需|不必/.test(clause)) return true; // negated prohibition is not a prohibition
    const body = clause.replace(PROHIBITION, "");
    if (PROHIBITION.test(clause) && !/可以|建议|不妨|不如|不(?:再)?停/.test(body)) continue;
    if (/^(?:是否|如需|需要)(?:[^。！？；]*)(?:需|必须|应)(?:[^。！？；]*)(?:医生|门诊)(?:[^。！？；]*)(?:确认|评估|决定)/.test(clause) && !/可以|建议先/.test(clause)) continue;
    return true;
  }
  return false;
}

/**
 * Research reply rule. A reply is accepted when it is the boundary text, or when every
 * clause (split on 。；！？\n) satisfies one of:
 *   a. it is fully covered by verbatim server-rendered tool facts, or
 *   b. it contains no outcome / efficacy / comparison / recommendation vocabulary
 *      (CONCLUSION below). Such non-numeric prose is allowed as wording.
 * Patient ids and all quantities are checked separately and strictly by
 * validateResponse: a clause with any number must itself be a tool-fact clause.
 * So the only free text that passes is number-free prose without conclusion wording.
 */
const CONCLUSION = /\b(?:OS|PFS|ORR|DCR|DFS|HR|RR)\b|生存|存活|活得|疗效|有效|获益|受益|缓解|缩小|控制|改善|延长|延缓|降低|提高|增加|减少|优于|劣于|更好|更差|更久|更长|更高|更低|更|最|较好|较差|显著|明显|说明|表明|证明|提示|因此|所以|导致|引起|归因|相关|对比|比较|差异|风险|预后|复发|进展|转移率|死亡率|推荐|建议|应该|应当|适合|安全|耐受/i;
export function isControlledResearchReply(text: string, calls: ToolCallRecord[]): boolean {
  if (text === RESEARCH_BOUNDARY) return true;
  const normalize = (s: string) => s.normalize("NFKC").replace(/[\s，。；：、（）“”「」·]/g, "");
  const t = normalize(text); if (!t) return false;
  const facts = toolFacts(calls).map(f => normalize(f.text)).filter(Boolean);
  for (const raw of text.normalize("NFKC").split(/[。；！？\n]/)) {
    const clause = normalize(raw); if (!clause) continue;
    if (!CONCLUSION.test(clause)) continue;
    const covered = new Uint8Array(clause.length);
    for (const f of facts) for (let i = clause.indexOf(f); i !== -1; i = clause.indexOf(f, i + 1)) covered.fill(1, i, i + f.length);
    if (!covered.every(x => x === 1)) return false;
  }
  return true;
}
