"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_FLOW_ACCESS_MESSAGE, canUseProductFlow } from "@/lib/access";

const DEPARTMENTS = ["온라인MD", "상품개발", "웹디자인", "오퍼레이션"];

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("온라인MD");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const cleanEmail = email.trim().toLowerCase();
  const isEmonsEmail = cleanEmail.endsWith("@emons.co.kr");

  const hasAnyProfile = async () => {
    const { data, error } = await supabase.rpc("has_product_flow_profiles");

    if (error) throw error;
    return Boolean(data);
  };

  const signUp = async () => {
    if (!name.trim()) return alert("이름을 입력해주세요.");
    if (!position.trim()) return alert("직급을 입력해주세요.");
    if (!department) return alert("담당부서를 선택해주세요.");
    if (!isEmonsEmail) return alert("emons.co.kr 회사 이메일만 가입 가능합니다.");
    if (password.length < 6) return alert("비밀번호는 6자리 이상 입력해주세요.");

    let isFirstProfile = false;
    try {
      isFirstProfile = !(await hasAnyProfile());
    } catch (error) {
      alert(`가입 상태 확인 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      return;
    }

    if (!isFirstProfile && !canUseProductFlow(cleanEmail)) return alert(PRODUCT_FLOW_ACCESS_MESSAGE);

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    if (data.user) {
      const isMaster = isFirstProfile || canUseProductFlow(cleanEmail);

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        email: cleanEmail,
        name: name.trim(),
        position: position.trim(),
        department,
        role: isMaster ? "admin" : "user",
        is_approved: isMaster,
      });

      if (profileError) {
        alert(`프로필 생성 오류: ${profileError.message}`);
        return;
      }
    }

    alert(isFirstProfile ? "마스터 계정 생성 완료! 바로 로그인할 수 있습니다." : "회원가입 완료! 관리자 승인 후 로그인 가능합니다.");
    setMode("login");
  };

  const signIn = async () => {
    if (!isEmonsEmail) return alert("emons.co.kr 회사 이메일만 로그인 가능합니다.");
    if (!password) return alert("비밀번호를 입력해주세요.");

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("사용자 정보를 찾을 수 없습니다.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      alert(`프로필 조회 오류: ${profileError.message}`);
      await supabase.auth.signOut();
      return;
    }

    if (!profile) {
      let isFirstProfile = false;
      try {
        isFirstProfile = !(await hasAnyProfile());
      } catch (error) {
        alert(`가입 상태 확인 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
        await supabase.auth.signOut();
        return;
      }

      if (isFirstProfile || canUseProductFlow(cleanEmail)) {
        const { error: createProfileError } = await supabase.from("profiles").upsert({
          id: user.id,
          email: cleanEmail,
          name: cleanEmail,
          position: "마스터",
          department: "온라인MD",
          role: "admin",
          is_approved: true,
        });

        if (createProfileError) {
          alert(`마스터 프로필 생성 오류: ${createProfileError.message}`);
          await supabase.auth.signOut();
          return;
        }

        router.push("/");
        return;
      }

      alert("프로필 정보가 없습니다. 관리자에게 문의해주세요.");
      await supabase.auth.signOut();
      return;
    }

    if (!profile.email) {
      await supabase.from("profiles").update({ email: cleanEmail }).eq("id", user.id);
    }

    if (!canUseProductFlow(cleanEmail, profile)) {
      alert(PRODUCT_FLOW_ACCESS_MESSAGE);
      await supabase.auth.signOut();
      return;
    }

    if (!profile.is_approved) {
      if (cleanEmail === "jhhwang1@emons.co.kr") {
        const { error: approveError } = await supabase
          .from("profiles")
          .update({
            email: cleanEmail,
            name: "황지훈",
            position: "부장",
            department: "온라인MD",
            role: "admin",
            is_approved: true,
          })
          .eq("id", user.id);

        if (approveError) {
          alert(`마스터 승인 오류: ${approveError.message}`);
          await supabase.auth.signOut();
          return;
        }

        router.push("/");
        return;
      }

      alert("관리자 승인 대기 상태입니다.");
      await supabase.auth.signOut();
      return;
    }

    router.push("/");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-5">
      <div className="w-full max-w-md rounded-[22px] border border-[#dfe7f0] bg-white p-8 shadow-[0_22px_60px_rgba(20,35,55,0.14)]">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-[72px] w-[72px] place-items-center rounded-[18px] bg-[#1b1688] text-2xl font-black text-white shadow-[0_16px_36px_rgba(27,22,136,0.22)]">
            OB
          </div>
          <p className="mt-7 text-xs font-black uppercase tracking-[0.08em] text-[#1b1688]">
            Product Development Flow
          </p>
          <h1 className="mt-2 text-[28px] font-black leading-tight text-slate-950">
            Online Business Workspace
          </h1>
          <p className="mt-3 text-sm font-bold text-slate-500">
            emons.co.kr 회사 이메일로만 이용 가능합니다.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-[14px] bg-[#eef3f8] p-1">
          <button
            onClick={() => setMode("login")}
            className={`rounded-[10px] py-3 text-sm font-black ${
              mode === "login" ? "bg-white text-[#1b1688] shadow-sm" : "text-slate-500"
            }`}
          >
            로그인
          </button>

          <button
            onClick={() => setMode("signup")}
            className={`rounded-[10px] py-3 text-sm font-black ${
              mode === "signup" ? "bg-white text-[#1b1688] shadow-sm" : "text-slate-500"
            }`}
          >
            회원가입
          </button>
        </div>

        <div className="space-y-4">
          {mode === "signup" && (
            <>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="이름"
                className="w-full rounded-[14px] border border-[#dfe7f0] bg-[#f8fbff] px-5 py-4 text-sm font-bold outline-none focus:border-[#1b1688] focus:bg-white"
              />

              <input
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                placeholder="직급 예: 부장 / 과장 / 대리"
                className="w-full rounded-[14px] border border-[#dfe7f0] bg-[#f8fbff] px-5 py-4 text-sm font-bold outline-none focus:border-[#1b1688] focus:bg-white"
              />

              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="w-full rounded-[14px] border border-[#dfe7f0] bg-[#f8fbff] px-5 py-4 text-sm font-bold outline-none focus:border-[#1b1688] focus:bg-white"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </>
          )}

          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="이메일(아이디) 예: name@emons.co.kr"
            className="w-full rounded-[14px] border border-[#dfe7f0] bg-[#f8fbff] px-5 py-4 text-sm font-bold outline-none focus:border-[#1b1688] focus:bg-white"
          />

          {email && !isEmonsEmail && (
            <p className="text-xs font-bold text-red-500">
              emons.co.kr 이메일만 사용할 수 있습니다.
            </p>
          )}

          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="비밀번호"
            className="w-full rounded-[14px] border border-[#dfe7f0] bg-[#f8fbff] px-5 py-4 text-sm font-bold outline-none focus:border-[#1b1688] focus:bg-white"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (mode === "login") signIn();
                else signUp();
              }
            }}
          />

          <button
            onClick={mode === "login" ? signIn : signUp}
            className="w-full rounded-[14px] bg-[#1b1688] py-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(27,22,136,0.22)] active:scale-95"
          >
            {mode === "login" ? "로그인" : "회원가입 요청"}
          </button>
        </div>
      </div>
    </main>
  );
}
