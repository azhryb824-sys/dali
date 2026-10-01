"use client";
import Link from "next/link";
import { usePublicLocale } from "./PublicLocaleProvider";
import type { ComponentProps } from "react";
import { localizedPath } from "@/lib/public-locale";
export default function PublicLink(props: ComponentProps<typeof Link>) {
  const locale = usePublicLocale() ?? "ar";
  return <Link {...props} href={typeof props.href === "string" ? localizedPath(props.href, locale) : props.href}/>;
}
