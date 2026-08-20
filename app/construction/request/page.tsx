import type { Metadata } from "next";
import ConstructionRequestForm from "../ConstructionRequestForm";
import ConstructionSubpage from "../ConstructionSubpage";
export const metadata:Metadata={title:"طلب دراسة مشروع مقاولات | دالي",description:"أرسل موقع المشروع ونوعه ونطاقه وموعده لبدء دراسة طلب المقاولات.",alternates:{canonical:"/construction/request"}};
export default function Page(){return <ConstructionSubpage eyebrow="طلب دراسة مشروع" title="ابدأ بالمعلومات المتاحة، وسنحدد المطلوب لاستكمال الدراسة" intro="كلما كانت الكميات والمخططات والموعد أوضح كانت المراجعة أدق. لا يلزم اكتمالها لإرسال الطلب الأولي."><section className="inner-content construction-standalone-form"><ConstructionRequestForm/></section></ConstructionSubpage>}
