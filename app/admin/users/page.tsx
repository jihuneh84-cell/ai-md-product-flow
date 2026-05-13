"use client";

export const dynamic = 'force-dynamic'
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_FLOW_ACCESS_MESSAGE, canUseProductFlow } from "@/lib/access";

type Profile = {
  id: string;
  email: string | null;
  name: string | null;
  position: string | null;
  department: string | null;
  role: "admin" | "user";
  is_approved: boolean;
  created_at: string;
};

export default function AdminUsersPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentAdminName, setCurrentAdminName] = useState("");

  const checkAdmin = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    if (!canUseProductFlow(user.email)) {
      await supabase.auth.signOut();
      alert(PRODUCT_FLOW_ACCESS_MESSAGE);
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin" || !profile.is_approved) {
      alert("관리자만 접근 가능합니다.");
      router.push("/");
      return;
    }

    setCurrentAdminName(profile.name ?? "관리자");
    setChecking(false);
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(`사용자 조회 오류: ${error.message}`);
      return;
    }

    setProfiles((data ?? []) as Profile[]);
  };

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (checking) return;

    fetchProfiles();

    const channel = supabase
      .channel("profiles-realtime-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => fetchProfiles()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checking]);

  const updateApproval = async (profileId: string, isApproved: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: isApproved })
      .eq("id", profileId);

    if (error) {
      alert(`승인 상태 변경 오류: ${error.message}`);
      return;
    }

    await fetchProfiles();
  };

  const updateRole = async (profileId: string, role: "admin" | "user") => {
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", profileId);

    if (error) {
      alert(`권한 변경 오류: ${error.message}`);
      return;
    }

    await fetchProfiles();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="rounded-3xl border bg-white px-8 py-6 text-center shadow-sm">
          <p className="text-lg font-black text-stone-900">관리자 권한 확인 중...</p>
          <p className="mt-2 text-sm font-bold text-stone-400">잠시만 기다려주세요.</p>
        </div>
      </main>
    );
  }

  const pendingCount = profiles.filter((profile) => !profile.is_approved).length;
  const approvedCount = profiles.filter((profile) => profile.is_approved).length;
  const adminCount = profiles.filter((profile) => profile.role === "admin").length;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-black">사용자 관리</h1>
            <p className="mt-1 text-sm font-medium text-stone-500">
              가입 요청 승인, 직급, 담당부서, 관리자 권한을 관리합니다.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-black">{currentAdminName}</p>
              <p className="text-xs font-bold text-purple-600">ADMIN</p>
            </div>

            <button
              onClick={() => router.push("/")}
              className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-black text-stone-600"
            >
              메인으로
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-black text-white"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <p className="text-xs font-black text-stone-400">전체 사용자</p>
            <p className="mt-2 text-3xl font-black">{profiles.length}</p>
          </div>

          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <p className="text-xs font-black text-stone-400">승인 완료</p>
            <p className="mt-2 text-3xl font-black text-blue-600">{approvedCount}</p>
          </div>

          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <p className="text-xs font-black text-stone-400">승인 대기</p>
            <p className="mt-2 text-3xl font-black text-orange-500">{pendingCount}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b px-6 py-5">
            <h2 className="text-lg font-black">가입 사용자 목록</h2>
            <p className="mt-1 text-xs font-bold text-stone-400">
              관리자 수: {adminCount}명
            </p>
          </div>

          <div className="divide-y">
            {profiles.length === 0 ? (
              <div className="p-10 text-center text-sm font-bold text-stone-400">
                등록된 사용자가 없습니다.
              </div>
            ) : (
              profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="grid gap-4 p-5 lg:grid-cols-[1fr_160px_260px]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black">
                        {profile.name || "이름 없음"}
                      </p>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          profile.is_approved
                            ? "bg-blue-100 text-blue-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {profile.is_approved ? "승인 완료" : "승인 대기"}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          profile.role === "admin"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {profile.role === "admin" ? "ADMIN" : "USER"}
                      </span>
                    </div>

                    <p className="mt-2 text-sm font-bold text-stone-500">
                      {profile.email || "이메일 정보 없음"}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-600">
                        직급: {profile.position || "미입력"}
                      </span>

                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                        담당: {profile.department || "미입력"}
                      </span>
                    </div>

                    <p className="mt-3 text-xs font-bold text-stone-400">
                      가입일: {profile.created_at?.slice(0, 10)}
                    </p>
                  </div>

                  <div className="flex items-center">
                    <select
                      value={profile.role}
                      onChange={(event) =>
                        updateRole(profile.id, event.target.value as "admin" | "user")
                      }
                      className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-black outline-none"
                    >
                      <option value="user">USER</option>
                      <option value="admin">ADMIN</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateApproval(profile.id, true)}
                      className={`flex-1 rounded-2xl px-4 py-3 text-sm font-black ${
                        profile.is_approved
                          ? "bg-blue-600 text-white"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      승인
                    </button>

                    <button
                      onClick={() => updateApproval(profile.id, false)}
                      className={`flex-1 rounded-2xl px-4 py-3 text-sm font-black ${
                        !profile.is_approved
                          ? "bg-red-600 text-white"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      승인 해제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
