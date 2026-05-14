"use client";

import { supabase } from "@/lib/supabaseClient";
import MessengerDock from "@/components/MessengerDock";

const WORKSPACE_URL = "https://design-workflow-rust.vercel.app/workspace";
const WEB_DESIGN_URL = "https://design-workflow-rust.vercel.app/dashboard";
const WEEKLY_URL = "https://design-workflow-rust.vercel.app/weekly";
const PRICING_URL = "https://design-workflow-rust.vercel.app/pricing";
const MESSENGER_URL = "https://design-workflow-rust.vercel.app/messenger";

type WorkspaceNavProps = {
  active?: "product" | "dashboard" | "calendar" | "portfolio" | "admin";
  userName?: string;
  onLogout?: () => void;
};

const items = [
  { label: "업무 선택", href: WORKSPACE_URL, external: true },
  { label: "웹디자인", href: WEB_DESIGN_URL, external: true },
  { label: "주간업무", href: WEEKLY_URL, external: true },
  { label: "가격결정서", href: PRICING_URL, external: true },
  { label: "메신저", href: MESSENGER_URL, external: true },
  { label: "상품개발", href: "/", active: "product" as const },
];

export default function WorkspaceNav({ active = "product", userName, onLogout }: WorkspaceNavProps) {
  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }

    await supabase.auth.signOut();
    window.location.href = "/login";
  };

    return (
      <>
        <nav className="fixed left-0 right-0 top-0 z-50 flex h-12 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur xl:px-6">
      <a href={WORKSPACE_URL} className="flex min-w-0 items-center gap-2 text-sm font-black text-slate-950">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#1b1688] text-xs text-white">
          OB
        </span>
        <span className="truncate">Online Business Workspace</span>
      </a>

      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {items.map((item) => {
                const productPages = ["dashboard", "calendar", "portfolio", "admin"];
                const isActive =
                  item.active === active ||
                  (item.active === "product" && productPages.includes(active));

            return (
              <a
                key={item.label}
                href={item.href}
                target={item.external ? "_self" : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-black transition ${
                  isActive
                    ? "bg-[#1b1688] text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>

        {userName && (
          <span className="hidden whitespace-nowrap text-xs font-black text-slate-400 lg:inline">
            {userName}
          </span>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-200"
        >
          로그아웃
        </button>
      </div>
        </nav>
        <MessengerDock />
      </>
    );
}
