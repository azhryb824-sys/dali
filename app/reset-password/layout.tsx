import "../login/login.css";
import { PwaAccessRuntime } from "@/app/components/PwaAccessRuntime";

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <><PwaAccessRuntime />{children}</>;
}
