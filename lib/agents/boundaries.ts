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

/** Research prose must consist of controlled descriptive facts; arbitrary conclusions are rejected. */
export function isControlledResearchReply(text: string, calls: ToolCallRecord[]): boolean {
  if (text === RESEARCH_BOUNDARY) return true;
  const normalize = (s: string) => s.normalize("NFKC").replace(/[\s，。；：、（）“”「」·]/g, "");
  const t = normalize(text); if (!t) return false;
  const covered = new Uint8Array(t.length);
  for (const fact of toolFacts(calls)) {
    const f = normalize(fact.text); if (!f) continue;
    for (let i = t.indexOf(f); i !== -1; i = t.indexOf(f, i + 1)) covered.fill(1, i, i + f.length);
  }
  return covered.every(x => x === 1);
}
