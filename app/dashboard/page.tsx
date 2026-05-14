"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_FLOW_ACCESS_MESSAGE, canUseProductFlow } from "@/lib/access";
import WorkspaceNav from "@/components/WorkspaceNav";

type Project = {
  id: string;
  name: string;
  current_step_id: string | null;
  completed_step_ids: string[];
};

type Profile = {
  id: string;
  name: string | null;
  role: string;
  is_approved: boolean;
};

const TOTAL_STEPS = 15;

export default function DashboardPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
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

    const { data: projectsData } = await supabase
      .from("projects")
      .select("*");

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_approved", true);

    setProjects(projectsData || []);
    setProfiles(profilesData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ===== KPI 계산 =====

  const totalProjects = projects.length;

  const completedProjects = projects.filter(
    (p) => p.completed_step_ids.length === TOTAL_STEPS
  ).length;

  const inProgressProjects = totalProjects - completedProjects;

  const avgProgress = useMemo(() => {
    if (projects.length === 0) return 0;

    const sum = projects.reduce(
      (acc, p) => acc + p.completed_step_ids.length,
      0
    );

    return Math.round((sum / (projects.length * TOTAL_STEPS)) * 100);
  }, [projects]);

  // ===== 병목 단계 =====

  const stepCountMap: Record<string, number> = {};

  projects.forEach((p) => {
    const step = p.current_step_id || "1-1";
    stepCountMap[step] = (stepCountMap[step] || 0) + 1;
  });

  const sortedSteps = Object.entries(stepCountMap).sort(
    (a, b) => b[1] - a[1]
  );

  // ===== 담당자별 업무 =====

  const userWorkMap: Record<string, number> = {};

  projects.forEach((p) => {
    Object.values(p.completed_step_ids || []).forEach(() => {});
  });

  return (
    <main className="min-h-screen bg-[#f4f7fb] p-6 pt-20 text-slate-950">
      <WorkspaceNav active="dashboard" />
      <div className="max-w-7xl mx-auto">

        <div className="flex justify-between mb-6">
          <h1 className="text-2xl font-black">📊 대시보드</h1>

          <button
            onClick={() => router.push("/")}
            className="bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-black"
          >
            메인으로
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20">로딩중...</div>
        ) : (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

              <Card title="전체 프로젝트" value={totalProjects} />
              <Card title="진행중" value={inProgressProjects} />
              <Card title="완료" value={completedProjects} />
              <Card title="평균 진행률" value={`${avgProgress}%`} />

            </div>

            {/* 병목 */}
            <div className="bg-white rounded-3xl p-6 border mb-6">
              <h2 className="font-black mb-4">🚧 단계별 병목</h2>

              {sortedSteps.map(([step, count]) => (
                <div key={step} className="flex justify-between text-sm mb-2">
                  <span>{step}</span>
                  <span className="font-black">{count}건</span>
                </div>
              ))}
            </div>

          </>
        )}
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: any }) {
  return (
    <div className="bg-white p-5 rounded-3xl border">
      <p className="text-xs text-stone-400 font-black">{title}</p>
      <p className="text-2xl font-black mt-2">{value}</p>
    </div>
  );
}
