import "../login/login.css";
import { PwaAccessRuntime } from "@/app/components/PwaAccessRuntime";

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <><PwaAccessRuntime />{children}</>;
}
