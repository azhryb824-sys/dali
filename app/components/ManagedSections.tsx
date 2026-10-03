import {safeWebsiteSectionImage,safeWebsiteButtonHref} from "@/lib/website-section-design";
import Image from "next/image";
import Link from "@/app/components/PublicLink";
import type {ManagedBlock} from "@/lib/website-content";
import "./managed-sections.css";
function inlineText(text:string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part,index)=>part.startsWith("**")&&part.endsWith("**")?<strong key={index}>{part.slice(2,-2)}</strong>:part.startsWith("*")&&part.endsWith("*")?<em key={index}>{part.slice(1,-1)}</em>:part);
}
export default function ManagedSections({blocks,sourcePrefix,showHidden=false}:{blocks:ManagedBlock[];sourcePrefix?:string;showHidden?:boolean}) {
  if(!blocks.some(block=>!block.hidden || showHidden))return null;
  return <div className="managed-sections">{blocks.map((block,index)=>block.hidden&&!showHidden?null:<section key={block.id || index} id={block.id?`section-${block.id}`:undefined} data-section-id={block.id} className={`managed-section layout-${block.layout || "text"} tone-${block.tone || "light"} align-${block.align || "start"} spacing-${block.spacing || "normal"}${block.hidden?" section-hidden":""}`}>
    {block.image && safeWebsiteSectionImage(block.image) && <div className="managed-section-image"><Image data-visual-source={sourcePrefix?`${sourcePrefix}.${index}.image`:undefined} src={block.image} alt={block.imageAlt || block.title} width={1200} height={700} sizes="(max-width:800px) 100vw, 60vw"/></div>}
    <div className="managed-section-copy"><h2 data-visual-source={sourcePrefix?`${sourcePrefix}.${index}.title`:undefined}>{block.title}</h2><div data-visual-source={sourcePrefix?`${sourcePrefix}.${index}.text`:undefined}>{block.text.split(/\n{2,}/).map((paragraph,i)=><p key={i}>{inlineText(paragraph)}</p>)}</div>
    {!!block.checklist.length && <ul className="managed-section-points">{block.checklist.map((point,i)=><li key={i} data-visual-source={sourcePrefix?`${sourcePrefix}.${index}.checklist.${i}`:undefined}>{block.layout === "steps" && <b>{String(i+1).padStart(2,"0")}</b>}{point}</li>)}</ul>}
    {!!block.buttons?.length && <div className="managed-section-buttons">{block.buttons.filter(button=>safeWebsiteButtonHref(button.href)).map((button,i)=><Link key={i} data-visual-source={sourcePrefix?`${sourcePrefix}.${index}.buttons.${i}.label`:undefined} className={`section-button button-${button.style}`} href={button.href} target={button.newTab?"_blank":undefined} rel={button.newTab?"noopener noreferrer":undefined}>{button.label}</Link>)}</div>}
    </div>
  </section>)}</div>;
}
