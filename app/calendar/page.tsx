"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_FLOW_ACCESS_MESSAGE, canUseProductFlow } from "@/lib/access";
import WorkspaceNav from "@/components/WorkspaceNav";

type Project = {
  id: string;
  name: string;
  created_at: string;
  target_date: string | null;
  current_step_id: string | null;
  completed_step_ids: string[];
  dates: Record<string, string>;
};

type Step = {
  id: string;
  title: string;
  department: string;
  icon: string;
};

type CalendarCell = {
  date: Date | null;
  dateKey: string;
  weekIndex: number;
  dayIndex: number;
};

type CalendarBar = {
  project: Project;
  weekIndex: number;
  startDayIndex: number;
  endDayIndex: number;
  isRealStart: boolean;
  isRealEnd: boolean;
};

const TOTAL_STEPS = 15;

const BASE_STEPS: Step[] = [
  { id: "1-1", icon: "📝", title: "시장조사 및 제품 기획", department: "상품개발" },
  { id: "1-2", icon: "🏭", title: "OEM 견적 요청 및 단가협의", department: "상품개발" },
  { id: "1-3", icon: "💰", title: "온라인 타겟 가격 설정", department: "온라인MD" },
  { id: "1-4", icon: "🔍", title: "판매 채널별 시장성 검토", department: "온라인MD" },
  { id: "1-5", icon: "⚖️", title: "진행여부 최종 확정", department: "황지훈 부장" },
  { id: "2-1", icon: "📨", title: "샘플 제작 및 발송 요청", department: "상품개발" },
  { id: "2-2", icon: "📦", title: "샘플 입고 및 실물 확인", department: "상품개발" },
  { id: "2-3", icon: "👀", title: "경영진 최종 품평회", department: "상품개발" },
  { id: "3-1", icon: "📊", title: "채널별 판매 목표 및 광고 예산 수립", department: "온라인MD" },
  { id: "3-2", icon: "📷", title: "제품 스튜디오 촬영 및 후보정", department: "상품개발 / 웹디자인" },
  { id: "3-3", icon: "🎨", title: "상세페이지 및 썸네일 제작", department: "웹디자인" },
  { id: "3-4", icon: "💻", title: "ERP 및 온라인 어드민 시스템 등록", department: "오퍼레이션" },
  { id: "4-1", icon: "🚀", title: "종합몰 / 오픈마켓 동시 런칭", department: "온라인MD" },
  { id: "4-2", icon: "📢", title: "프로모션 및 외부 광고 실행", department: "온라인MD" },
  { id: "4-3", icon: "📈", title: "초기 성과 평가 및 피드백", department: "온라인MD / 상품개발" },
];

function getStepById(stepId?: string | null) {
  return BASE_STEPS.find((step) => step.id === stepId) ?? BASE_STEPS[0];
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function getCalendarCells(year: number, month: number): CalendarCell[] {
  const firstDate = new Date(year, month, 1);
  const startDay = firstDate.getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const cells: CalendarCell[] = [];
  let index = 0;

  for (let i = 0; i < startDay; i++) {
    cells.push({
      date: null,
      dateKey: "",
      weekIndex: Math.floor(index / 7),
      dayIndex: index % 7,
    });
    index++;
  }

  for (let day = 1; day <= lastDate; day++) {
    const date = new Date(year, month, day);
    cells.push({
      date,
      dateKey: toDateKey(date),
      weekIndex: Math.floor(index / 7),
      dayIndex: index % 7,
    });
    index++;
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      date: null,
      dateKey: "",
      weekIndex: Math.floor(index / 7),
      dayIndex: index % 7,
    });
    index++;
  }

  return cells;
}

function getProjectStartDate(project: Project) {
  return project.dates?.["1-1"] || project.created_at.slice(0, 10);
}

function getProjectEndDate(project: Project) {
  return project.target_date || project.created_at.slice(0, 10);
}

function buildCalendarBars(projects: Project[], cells: CalendarCell[]): CalendarBar[] {
  const validCells = cells.filter((cell) => cell.date);
  const bars: CalendarBar[] = [];

  if (validCells.length === 0) return bars;

  const monthStartKey = validCells[0].dateKey;
  const monthEndKey = validCells[validCells.length - 1].dateKey;

  projects.forEach((project) => {
    const rawStartKey = getProjectStartDate(project);
    const rawEndKey = getProjectEndDate(project);

    const startKey = rawStartKey > rawEndKey ? rawEndKey : rawStartKey;
    const endKey = rawStartKey > rawEndKey ? rawStartKey : rawEndKey;

    if (endKey < monthStartKey || startKey > monthEndKey) return;

    const visibleStartKey = startKey < monthStartKey ? monthStartKey : startKey;
    const visibleEndKey = endKey > monthEndKey ? monthEndKey : endKey;

    const visibleCells = validCells.filter(
      (cell) => cell.dateKey >= visibleStartKey && cell.dateKey <= visibleEndKey
    );

    const weekGroups: Record<number, CalendarCell[]> = {};

    visibleCells.forEach((cell) => {
      if (!weekGroups[cell.weekIndex]) weekGroups[cell.weekIndex] = [];
      weekGroups[cell.weekIndex].push(cell);
    });

    Object.entries(weekGroups).forEach(([weekIndex, weekCells]) => {
      const sorted = weekCells.sort((a, b) => a.dayIndex - b.dayIndex);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      bars.push({
        project,
        weekIndex: Number(weekIndex),
        startDayIndex: first.dayIndex,
        endDayIndex: last.dayIndex,
        isRealStart: first.dateKey === startKey || first.dayIndex === 0,
        isRealEnd: last.dateKey === endKey,
      });
    });
  });

  return bars;
}

export default function CalendarPage() {
  const router = useRouter();
  const today = new Date();

  const [projects, setProjects] = useState<Project[]>([]);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_approved")
      .eq("id", user.id)
      .maybeSingle();

    if (!canUseProductFlow(user.email, profile)) {
      await supabase.auth.signOut();
      alert(PRODUCT_FLOW_ACCESS_MESSAGE);
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .select("id, name, created_at, target_date, current_step_id, completed_step_ids, dates")
      .order("created_at", { ascending: false });

    if (error) {
      alert(`프로젝트 조회 오류: ${error.message}`);
      setLoading(false);
      return;
    }

    setProjects((data ?? []) as Project[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();

    const channel = supabase
      .channel("calendar-projects-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const calendarCells = useMemo(() => getCalendarCells(year, month), [year, month]);

  const weekCount = useMemo(() => {
    return Math.ceil(calendarCells.length / 7);
  }, [calendarCells]);

  const bars = useMemo(() => {
    return buildCalendarBars(projects, calendarCells);
  }, [projects, calendarCells]);

  const moveMonth = (amount: number) => {
    const next = new Date(year, month + amount, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] pt-12 text-slate-950">
      <WorkspaceNav active="calendar" />
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-black">프로젝트 진행 캘린더</h1>
            <p className="mt-1 text-sm font-medium text-stone-500">
              프로젝트별 진행 기간을 하나의 긴 바로 표시합니다.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-black text-stone-600"
            >
              메인으로
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl bg-blue-100 px-4 py-2 text-sm font-black text-blue-700"
            >
              대시보드
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-stone-400">MONTH VIEW</p>
            <h2 className="mt-1 text-2xl font-black">
              {year}년 {month + 1}월
            </h2>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => moveMonth(-1)}
              className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-black text-stone-600"
            >
              이전 달
            </button>

            <button
              onClick={() => {
                setYear(today.getFullYear());
                setMonth(today.getMonth());
              }}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white"
            >
              이번 달
            </button>

            <button
              onClick={() => moveMonth(1)}
              className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-black text-stone-600"
            >
              다음 달
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border bg-white p-10 text-center text-sm font-black text-stone-500">
            캘린더 데이터를 불러오는 중입니다...
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
            <div className="grid grid-cols-7 border-b bg-stone-100 text-center text-xs font-black text-stone-500">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <div key={day} className="p-3">
                  {day}
                </div>
              ))}
            </div>

            <div className="relative">
              <div className="grid grid-cols-7">
                {calendarCells.map((cell, index) => {
                  const isToday = cell.dateKey === toDateKey(today);

                  return (
                    <div
                      key={index}
                      className={`min-h-[170px] border-b border-r p-3 ${
                        cell.date ? "bg-white" : "bg-stone-50"
                      }`}
                    >
                      {cell.date && (
                        <div className="flex items-center justify-between">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${
                              isToday
                                ? "bg-blue-600 text-white"
                                : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {cell.date.getDate()}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pointer-events-none absolute inset-0">
                {Array.from({ length: weekCount }).map((_, weekIndex) => {
                  const weekBars = bars.filter((bar) => bar.weekIndex === weekIndex);

                  return (
                    <div
                      key={weekIndex}
                      className="absolute left-0 right-0"
                      style={{
                        top: `${weekIndex * 170 + 52}px`,
                        height: "110px",
                      }}
                    >
                      {weekBars.map((bar, barIndex) => {
                        const currentStep = getStepById(bar.project.current_step_id);
                        const progress = Math.round(
                          ((bar.project.completed_step_ids?.length ?? 0) / TOTAL_STEPS) * 100
                        );

                        const leftPercent = (bar.startDayIndex / 7) * 100;
                        const widthPercent =
                          ((bar.endDayIndex - bar.startDayIndex + 1) / 7) * 100;

                        const shouldShowText = bar.isRealStart || bar.startDayIndex === 0;

                        return (
                          <button
                            key={`${bar.project.id}-${weekIndex}`}
                            onClick={() => router.push(`/?projectId=${bar.project.id}`)}
                            className="pointer-events-auto absolute rounded-2xl border border-blue-200 bg-blue-600 px-3 py-2 text-left text-white shadow-sm transition hover:bg-blue-700"
                            style={{
                              left: `calc(${leftPercent}% + 8px)`,
                              width: `calc(${widthPercent}% - 16px)`,
                              top: `${barIndex * 34}px`,
                              height: "28px",
                            }}
                            title={`${bar.project.name} / ${currentStep.title} / ${progress}%`}
                          >
                            {shouldShowText ? (
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-[11px] font-black">
                                  {bar.project.name}
                                </span>
                                <span className="shrink-0 text-[10px] font-bold opacity-90">
                                  {currentStep.icon} {progress}%
                                </span>
                              </div>
                            ) : (
                              <div className="h-full w-full" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 rounded-3xl border bg-white p-5 text-sm font-bold text-stone-500">
          <p className="font-black text-stone-900">표시 기준</p>
          <p className="mt-2">
            시장조사 및 제품 기획 완료일이 있으면 그 날짜부터 출시목표일까지 긴 바로 표시합니다.
            월이 넘어가면 해당 월 첫 표시 위치에서 프로젝트명이 다시 보입니다.
          </p>
        </div>
      </section>
    </main>
  );
}
