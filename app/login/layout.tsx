import "./login.css";
import { PwaAccessRuntime } from "@/app/components/PwaAccessRuntime";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <><PwaAccessRuntime />{children}</>;
}
