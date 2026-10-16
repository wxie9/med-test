import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
export default function PharmaLayout({ children }: { children: React.ReactNode }) {
  return <main className="pharma-workspace"><nav aria-label="药企项目导航" className="section-tabs"><Link className="section-tab" aria-current="page" href="/pharma/projects"><Icon name="project" size={16}/>支持服务项目</Link><Link className="section-tab" href="/research"><Icon name="search" size={16}/>研究演示</Link></nav>{children}</main>;
}
