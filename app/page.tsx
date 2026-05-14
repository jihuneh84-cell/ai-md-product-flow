"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_FLOW_ACCESS_MESSAGE, canUseProductFlow } from "@/lib/access";
import WorkspaceNav from "@/components/WorkspaceNav";

type Step = {
  id: string;
  phaseId: number;
  title: string;
  owner: string;
  department: string;
  icon: string;
};

type ProjectFile = {
  id: string;
  name: string;
  path: string;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
  fileGroup?: "plan" | "sample" | "general";
};

type Project = {
  id: string;
  name: string;
  created_at: string;
  target_date: string | null;
  current_step_id: string | null;
  completed_step_ids: string[];
  owners: Record<string, string>;
  notes: Record<string, string>;
  dates: Record<string, string>;
  files: Record<string, ProjectFile[]>;
};

type Profile = {
  id: string;
  email: string | null;
  name: string | null;
  position: string | null;
  department: string | null;
  role: "admin" | "user";
  is_approved: boolean;
};

const UI_FONT = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

const STORAGE_BUCKET = "project-files";
const EXPECTED_TAG_PRICE_NOTE_KEY = "1-3_expected_tag_price";
const PLANNING_ITEM_NOTE_KEY = "1-1_item";
const PLANNING_SPECIES_NOTE_KEY = "1-1_species";

const ITEM_OPTIONS: Record<string, string[]> = {
  거실: ["소파", "거실수납장", "스툴"],
  침실: ["침대", "매트리스", "협탁", "화장대", "옷장", "스툴"],
  주방: ["식탁", "식탁의자", "주방수납"],
  서재: ["서재"],
  키즈: ["키즈"],
  인테리어: ["인테리어"],
  리빙소품: ["침구류", "러그", "수건", "조명"],
};

const BASE_STEPS: Step[] = [
  { id: "1-1", phaseId: 1, icon: "📝", title: "시장조사 및 제품 기획", owner: "담당자 미정", department: "상품개발" },
  { id: "1-2", phaseId: 1, icon: "🏭", title: "OEM 견적 요청 및 단가협의", owner: "담당자 미정", department: "상품개발" },
  { id: "1-3", phaseId: 1, icon: "💰", title: "온라인 타겟 가격 설정", owner: "담당자 미정", department: "온라인MD" },
  { id: "1-4", phaseId: 1, icon: "🔍", title: "판매 채널별 시장성 검토", owner: "담당자 미정", department: "온라인MD" },
  { id: "1-5", phaseId: 1, icon: "⚖️", title: "진행여부 최종 확정", owner: "황지훈 부장", department: "황지훈 부장" },
  { id: "2-1", phaseId: 2, icon: "📨", title: "샘플 제작 및 발송 요청", owner: "담당자 미정", department: "상품개발" },
  { id: "2-2", phaseId: 2, icon: "📦", title: "샘플 입고 및 실물 확인", owner: "담당자 미정", department: "상품개발" },
  { id: "2-3", phaseId: 2, icon: "👀", title: "경영진 최종 품평회", owner: "담당자 미정", department: "상품개발" },
  { id: "3-1", phaseId: 3, icon: "📊", title: "채널별 판매 목표 및 광고 예산 수립", owner: "담당자 미정", department: "온라인MD" },
  { id: "3-2", phaseId: 3, icon: "📷", title: "제품 스튜디오 촬영 및 후보정", owner: "담당자 미정", department: "상품개발 / 웹디자인" },
  { id: "3-3", phaseId: 3, icon: "🎨", title: "상세페이지 및 썸네일 제작", owner: "담당자 미정", department: "웹디자인" },
  { id: "3-4", phaseId: 3, icon: "💻", title: "ERP 및 온라인 어드민 시스템 등록", owner: "담당자 미정", department: "오퍼레이션" },
  { id: "4-1", phaseId: 4, icon: "🚀", title: "온라인 상품등록", owner: "담당자 미정", department: "온라인MD" },
  { id: "4-2", phaseId: 4, icon: "📢", title: "프로모션 및 외부 광고 실행", owner: "담당자 미정", department: "온라인MD" },
  { id: "4-3", phaseId: 4, icon: "📈", title: "초기 성과 평가 및 피드백", owner: "담당자 미정", department: "온라인MD / 상품개발" },
];

const PHASES = [
  { id: 1, title: "기획 및 시장성 검증" },
  { id: 2, title: "품질 검증 및 품평" },
  { id: 3, title: "런칭 준비 및 콘텐츠 제작" },
  { id: 4, title: "마케팅 실행 및 성과 분석" },
];

function getStepById(stepId?: string | null) {
  return BASE_STEPS.find((step) => step.id === stepId) ?? BASE_STEPS[0];
}

function getNextStepId(stepId: string) {
  const currentIndex = BASE_STEPS.findIndex((step) => step.id === stepId);
  if (currentIndex < 0) return BASE_STEPS[0].id;
  return BASE_STEPS[currentIndex + 1]?.id ?? stepId;
}

function getPreviousIncompleteStepId(completedStepIds: string[]) {
  const firstIncomplete = BASE_STEPS.find((step) => !completedStepIds.includes(step.id));
  return firstIncomplete?.id ?? BASE_STEPS[BASE_STEPS.length - 1].id;
}


function parsePriceNumber(value?: string | null) {
  if (!value) return null;
  const numberValue = Number(String(value).replace(/,/g, "").trim());
  return Number.isNaN(numberValue) ? null : numberValue;
}

function findSampleImageUrl(files?: Record<string, ProjectFile[]>) {
  const stepFiles = files?.["1-1"] ?? [];
  const sampleFile = stepFiles.find((file) => (file.fileGroup || "general") === "sample");
  return sampleFile?.url || stepFiles.find((file) => file.url)?.url || null;
}

function getProductCategoryFromProject(project: Project) {
  const space = project.notes?.[PLANNING_ITEM_NOTE_KEY] || "침실";
  const category = project.notes?.[PLANNING_SPECIES_NOTE_KEY] || null;
  return { space, category };
}

function getDepartmentsFromStep(departmentText: string) {
  return departmentText
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isProfileAvailableForStep(profile: Profile, step: Step) {
  if (!profile.is_approved) return false;

  if (step.department === "황지훈 부장") {
    return profile.email === "jhhwang1@emons.co.kr" || profile.role === "admin";
  }

  const departments = getDepartmentsFromStep(step.department);
  return departments.includes(profile.department ?? "");
}

function getDaysLeft(targetDate?: string | null) {
  if (!targetDate) return null;

  const today = new Date();
  const target = new Date(targetDate);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function Home() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "user">("user");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState(1);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedStep = useMemo(
    () => BASE_STEPS.find((step) => step.id === selectedStepId) ?? null,
    [selectedStepId]
  );

  const currentSteps = BASE_STEPS.filter((step) => step.phaseId === selectedPhaseId);

  const selectedProjectCurrentStep = selectedProject
    ? getStepById(selectedProject.current_step_id)
    : BASE_STEPS[0];

  const isAdmin = currentUserRole === "admin";

  const getOwnerDisplayName = (ownerValue?: string) => {
    if (!ownerValue) return "담당자 미정";

    const matchedProfile = profiles.find(
      (profile) =>
        profile.id === ownerValue ||
        profile.email === ownerValue ||
        profile.name === ownerValue
    );

    if (matchedProfile) {
      const position = matchedProfile.position ? ` ${matchedProfile.position}` : "";
      const dept = matchedProfile.department ? ` / ${matchedProfile.department}` : "";
      return `${matchedProfile.name || matchedProfile.email || "이름 없음"}${position}${dept}`;
    }

    return ownerValue;
  };

  const isCurrentUserStepOwner = (stepId: string) => {
    if (!selectedProject) return false;

    const ownerValue = selectedProject.owners?.[stepId];
    if (!ownerValue) return false;

    return (
      ownerValue === currentUserId ||
      ownerValue === currentUserEmail ||
      ownerValue === currentUserName
    );
  };

  const getAssignableProfilesForStep = (step: Step) => {
    return profiles.filter((profile) => isProfileAvailableForStep(profile, step));
  };

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !profile) {
      await supabase.auth.signOut();
      router.push("/login");
      return;
    }

    if (!canUseProductFlow(user.email, profile)) {
      await supabase.auth.signOut();
      alert(PRODUCT_FLOW_ACCESS_MESSAGE);
      router.push("/login");
      return;
    }

    if (!profile.is_approved) {
      await supabase.auth.signOut();
      alert("관리자 승인 대기 상태입니다.");
      router.push("/login");
      return;
    }

    setCurrentUserId(user.id);
    setCurrentUserEmail(user.email ?? "");
    setCurrentUserName(profile.name ?? user.email ?? "");
    setCurrentUserRole(profile.role ?? "user");
    setCheckingAuth(false);
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_approved", true)
      .order("name", { ascending: true });

    if (error) {
      alert(`담당자 목록 조회 오류: ${error.message}`);
      return;
    }

    setProfiles((data ?? []) as Profile[]);
  };

  const fetchProjects = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(`프로젝트 조회 오류: ${error.message}`);
      setLoading(false);
      return;
    }

    const projectList = (data ?? []) as Project[];
    setProjects(projectList);

    const params = new URLSearchParams(window.location.search);
    const projectIdFromUrl = params.get("projectId");

    if (projectIdFromUrl) {
      const targetProject = projectList.find((project) => project.id === projectIdFromUrl);

      if (targetProject) {
        const currentStep = getStepById(targetProject.current_step_id);
        setSelectedProjectId(targetProject.id);
        setSelectedPhaseId(currentStep.phaseId);
        setSelectedStepId(targetProject.current_step_id ?? "1-1");
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (checkingAuth) return;

    fetchProfiles();
    fetchProjects();

    const projectsChannel = supabase
      .channel("projects-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        fetchProjects();
      })
      .subscribe();

    const profilesChannel = supabase
      .channel("profiles-realtime-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchProfiles();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(projectsChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, [checkingAuth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const createProject = async () => {
    const name = newProjectName.trim();

    if (!name) {
      alert("프로젝트명을 입력해주세요.");
      return;
    }

    if (!newTargetDate) {
      alert("출시목표일을 선택해주세요.");
      return;
    }

    const { error } = await supabase.from("projects").insert({
      name,
      target_date: newTargetDate,
      current_step_id: "1-1",
      completed_step_ids: [],
      owners: {},
      notes: {},
      dates: {},
      files: {},
    });

    if (error) {
      alert(`프로젝트 생성 오류: ${error.message}`);
      return;
    }

    setNewProjectName("");
    setNewTargetDate("");
    await fetchProjects();
  };

  const updateProject = async (updated: Project) => {
    setProjects((prev) =>
      prev.map((project) => (project.id === updated.id ? updated : project))
    );

    const { error } = await supabase
      .from("projects")
      .update({
        target_date: updated.target_date,
        current_step_id: updated.current_step_id,
        completed_step_ids: updated.completed_step_ids,
        owners: updated.owners ?? {},
        notes: updated.notes ?? {},
        dates: updated.dates ?? {},
        files: updated.files ?? {},
      })
      .eq("id", updated.id);

    if (error) {
      alert(`저장 오류: ${error.message}`);
      await fetchProjects();
    }
  };

  const moveCurrentStep = async (stepId: string) => {
    if (!selectedProject) return;

    if (!isAdmin) {
      alert("현재 단계 수동 변경은 관리자만 가능합니다.");
      return;
    }

    const step = getStepById(stepId);

    const updated: Project = {
      ...selectedProject,
      current_step_id: stepId,
    };

    setSelectedPhaseId(step.phaseId);
    setSelectedStepId(stepId);
    await updateProject(updated);
  };

  const toggleStepComplete = async (stepId: string) => {
    if (!selectedProject) return;

    if (!isAdmin && !isCurrentUserStepOwner(stepId)) {
      alert("해당 단계 담당자 또는 관리자만 완료 처리/완료 취소를 할 수 있습니다.");
      return;
    }

    const isCompleted = selectedProject.completed_step_ids.includes(stepId);

    if (!isCompleted) {
      const stepIndex = BASE_STEPS.findIndex((step) => step.id === stepId);
      const previousIncompleteStep = BASE_STEPS.slice(0, stepIndex).find(
        (step) => !selectedProject.completed_step_ids.includes(step.id)
      );

      if (previousIncompleteStep) {
        alert(`전 단계가 먼저 완료되어야 합니다.\n미완료 단계: ${previousIncompleteStep.title}`);
        return;
      }

      const stepFiles = selectedProject.files?.[stepId] ?? [];

      if (stepId === "1-1") {
        const planningItem = selectedProject.notes?.[PLANNING_ITEM_NOTE_KEY]?.trim();
        const planningSpecies = selectedProject.notes?.[PLANNING_SPECIES_NOTE_KEY]?.trim();
        const hasPlanFile = stepFiles.some((file) => (file.fileGroup || "general") === "plan");
        const hasSampleImage = stepFiles.some((file) => (file.fileGroup || "general") === "sample");

        if (!planningItem || !planningSpecies) {
          alert("시장조사 및 제품 기획 단계는 품목과 품종을 모두 선택해야 완료 처리할 수 있습니다.");
          return;
        }

        if (!hasPlanFile || !hasSampleImage) {
          alert("시장조사 및 제품 기획 단계는 기획서와 샘플 이미지를 모두 업로드해야 완료 처리할 수 있습니다.");
          return;
        }
      } else if (stepFiles.length === 0) {
        alert("파일을 1개 이상 업로드해야 완료 처리할 수 있습니다.");
        return;
      }

      if (stepId === "1-3" && !selectedProject.notes?.[EXPECTED_TAG_PRICE_NOTE_KEY]?.trim()) {
        alert("온라인 타겟 가격 설정 단계는 예상 TAG가를 입력해야 상품맵에 연동할 수 있습니다.");
        return;
      }
    }

    const nextCompletedStepIds = isCompleted
      ? selectedProject.completed_step_ids.filter((id) => id !== stepId)
      : [...selectedProject.completed_step_ids, stepId];

    const nextCurrentStepId = isCompleted
      ? getPreviousIncompleteStepId(nextCompletedStepIds)
      : getNextStepId(stepId);

    const nextCurrentStep = getStepById(nextCurrentStepId);

    const updated: Project = {
      ...selectedProject,
      completed_step_ids: nextCompletedStepIds,
      current_step_id: nextCurrentStepId,
      dates: {
        ...(selectedProject.dates ?? {}),
        [stepId]: isCompleted ? "" : new Date().toISOString().slice(0, 10),
      },
    };

    setSelectedPhaseId(nextCurrentStep.phaseId);
    await updateProject(updated);

    if (!isCompleted && stepId === "4-1") {
      await syncLaunchedProjectToRawData(updated, updated.dates?.["4-1"] || new Date().toISOString().slice(0, 10));
    }
  };

  const syncLaunchedProjectToRawData = async (project: Project, launchDate: string) => {
    const expectedTagPrice = parsePriceNumber(project.notes?.[EXPECTED_TAG_PRICE_NOTE_KEY]);
    const { space, category } = getProductCategoryFromProject(project);
    const imageUrl = findSampleImageUrl(project.files);

    if (!expectedTagPrice) {
      alert("온라인 상품등록은 완료됐지만 예상 TAG가가 없어 포트폴리오 Raw Data 자동 등록을 건너뛰었습니다.");
      return;
    }

    const payload = {
      space,
      category,
      series_name: project.name,
      tag_price: expectedTagPrice,
      price: expectedTagPrice,
      age_target: 30,
      image_url: imageUrl,
      planning_image_url: imageUrl,
      estimated_tag_price: expectedTagPrice,
      status: "진행중",
      current_stage: "운영중",
      launch_target_date: launchDate,
      external_code: "프로젝트연동",
      source_type: "project_launch",
      project_id: project.id,
    };

    const { data: existing, error: selectError } = await supabase
      .from("products")
      .select("id")
      .eq("project_id", project.id)
      .limit(1);

    if (selectError) {
      alert(`포트폴리오 Raw Data 연동 확인 오류: ${selectError.message}`);
      return;
    }

    const existingId = existing?.[0]?.id;
    const { error } = existingId
      ? await supabase.from("products").update(payload).eq("id", existingId)
      : await supabase.from("products").insert(payload);

    if (error) {
      alert(`포트폴리오 Raw Data 자동 등록 오류: ${error.message}`);
      return;
    }

    alert("온라인 상품등록 완료일 기준으로 포트폴리오 Raw Data에 운영중 상품이 자동 반영되었습니다.");
  };

  const updateOwner = async (stepId: string, owner: string) => {
    if (!selectedProject) return;

    if (!isAdmin) {
      alert("담당자 지정은 관리자만 가능합니다.");
      return;
    }

    await updateProject({
      ...selectedProject,
      owners: {
        ...(selectedProject.owners ?? {}),
        [stepId]: owner,
      },
    });
  };

  const updateNote = async (stepId: string, note: string) => {
    if (!selectedProject) return;

    if (!isAdmin && !isCurrentUserStepOwner(stepId)) {
      alert("해당 단계 담당자 또는 관리자만 업무 메모를 수정할 수 있습니다.");
      return;
    }

    await updateProject({
      ...selectedProject,
      notes: {
        ...(selectedProject.notes ?? {}),
        [stepId]: note,
      },
    });
  };

  const uploadFiles = async (
    files: File[],
    stepId: string,
    fileGroup: ProjectFile["fileGroup"] = "general"
  ) => {
    if (!selectedProject) return;

    if (!isAdmin && !isCurrentUserStepOwner(stepId)) {
      alert("해당 단계 담당자 또는 관리자만 파일을 업로드할 수 있습니다.");
      return;
    }

    if (files.length === 0) return;

    setUploading(true);

    try {
      const existingFiles = selectedProject.files?.[stepId] ?? [];
      const uploadedFiles: ProjectFile[] = [];

      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-가-힣]/g, "_");
        const fileId = crypto.randomUUID();
        const path = `${selectedProject.id}/${stepId}/${fileGroup}/${fileId}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          alert(`파일 업로드 오류: ${uploadError.message}`);
          continue;
        }

        const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

        uploadedFiles.push({
          id: fileId,
          name: file.name,
          path,
          url: data.publicUrl,
          uploadedBy: currentUserName || currentUserEmail,
          uploadedAt: new Date().toISOString(),
          fileGroup,
        });
      }

      if (uploadedFiles.length > 0) {
        await updateProject({
          ...selectedProject,
          files: {
            ...(selectedProject.files ?? {}),
            [stepId]: [...existingFiles, ...uploadedFiles],
          },
        });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    stepId: string,
    fileGroup: ProjectFile["fileGroup"] = "general"
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    await uploadFiles(selectedFiles, stepId, fileGroup);
    event.target.value = "";
  };

  const handleFileDrop = async (
    event: DragEvent<HTMLLabelElement | HTMLDivElement>,
    stepId: string,
    fileGroup: ProjectFile["fileGroup"] = "general"
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const droppedFiles = Array.from(event.dataTransfer.files ?? []);
    await uploadFiles(droppedFiles, stepId, fileGroup);
  };

  const removeFile = async (stepId: string, file: ProjectFile) => {
    if (!selectedProject) return;

    if (!isAdmin && !isCurrentUserStepOwner(stepId)) {
      alert("해당 단계 담당자 또는 관리자만 파일을 삭제할 수 있습니다.");
      return;
    }

    const confirmDelete = window.confirm(`파일을 삭제할까요?\n${file.name}`);
    if (!confirmDelete) return;

    const { error: removeError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([file.path]);

    if (removeError) {
      alert(`파일 삭제 오류: ${removeError.message}`);
      return;
    }

    const nextFiles = (selectedProject.files?.[stepId] ?? []).filter(
      (item) => item.id !== file.id
    );

    await updateProject({
      ...selectedProject,
      files: {
        ...(selectedProject.files ?? {}),
        [stepId]: nextFiles,
      },
    });
  };

  const progress = selectedProject
    ? Math.round((selectedProject.completed_step_ids.length / BASE_STEPS.length) * 100)
    : 0;

  if (checkingAuth) {
    return (
      <main style={{ fontFamily: UI_FONT }} className="flex min-h-screen items-center justify-center bg-[#f6f3ee] text-[15px] font-semibold text-stone-950 antialiased">
        <div className="rounded-3xl border bg-white px-8 py-6 text-center shadow-sm">
          <p className="text-xl font-black">인증 확인 중...</p>
          <p className="mt-2 text-[15px] font-extrabold text-stone-700">사용자 권한을 확인하고 있습니다.</p>
        </div>
      </main>
    );
  }

  if (!selectedProject) {
    return (
      <main style={{ fontFamily: UI_FONT }} className="min-h-screen bg-[#f4f7fb] pt-12 text-[15px] font-semibold text-slate-950 antialiased">
        <WorkspaceNav active="product" userName={currentUserName} onLogout={handleLogout} />
        <header className="border-b border-[#dfe7f0] bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[#1b1688] text-sm font-black text-white">
                OB
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.08em] text-[#1b1688]">Product Development Flow</p>
                <h1 className="mt-1 text-xl font-black">Online Business Workspace</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-[15px] font-black text-stone-900">{currentUserName}</p>
                <p className="text-[14px] font-extrabold text-stone-700">{currentUserRole}</p>
              </div>

              {isAdmin && (
                <button
                  onClick={() => router.push("/admin/users")}
                  className="rounded-[10px] bg-[#eeefff] px-4 py-2 text-[15px] font-black text-[#1b1688]"
                >
                  사용자 관리
                </button>
              )}

              <button
                type="button"
                onClick={() => router.push("/calendar")}
                className="rounded-[10px] bg-[#eef3f8] px-4 py-2 text-[15px] font-black text-slate-700"
              >
                캘린더
              </button>

              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-[10px] bg-[#eef3f8] px-4 py-2 text-[15px] font-black text-slate-700"
              >
                대시보드
              </button>

              <button
                type="button"
                onClick={() => router.push("/product-map")}
                className="rounded-[10px] bg-[#eef3f8] px-4 py-2 text-[15px] font-black text-slate-700"
              >
                포트폴리오
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-[10px] bg-slate-100 px-4 py-2 text-[15px] font-black text-slate-700"
              >
                로그아웃
              </button>

              <div className="rounded-[10px] bg-[#1b1688] px-4 py-2 text-[15px] font-black text-white">
                Supabase Connected
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-8 rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-black">새 프로젝트 생성</h2>
            <div className="grid gap-3 lg:grid-cols-[1fr_220px_160px]">
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createProject();
                }}
                placeholder="예: 2026 FW 커스텀 소파 출시"
                className="rounded-2xl border border-stone-400 bg-[#f6f3ee] px-5 py-4 text-[15px] font-extrabold outline-none focus:border-blue-500 focus:bg-white"
              />

              <input
                value={newTargetDate}
                onChange={(event) => setNewTargetDate(event.target.value)}
                type="date"
                className="rounded-2xl border border-stone-400 bg-[#f6f3ee] px-5 py-4 text-[15px] font-extrabold outline-none focus:border-blue-500 focus:bg-white"
              />

              <button
                onClick={createProject}
                className="rounded-2xl bg-blue-600 px-6 py-4 text-[15px] font-black text-white shadow-lg shadow-blue-600/20 active:scale-95"
              >
                프로젝트 생성
              </button>
            </div>
            <p className="mt-3 text-[13px] font-extrabold text-stone-700">
              출시목표일은 프로젝트 일정과 캘린더 기준일로 사용됩니다.
            </p>
          </div>

          {loading ? (
            <div className="rounded-3xl border bg-white p-10 text-center text-[15px] font-black text-stone-700">
              DB에서 프로젝트를 불러오는 중입니다...
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-stone-400 bg-white p-10 text-center">
                  <p className="text-4xl">📂</p>
                  <p className="mt-4 text-[15px] font-extrabold text-stone-700">
                    아직 생성된 프로젝트가 없습니다.
                  </p>
                </div>
              ) : (
                projects.map((project) => {
                  const percent = Math.round(
                    (project.completed_step_ids.length / BASE_STEPS.length) * 100
                  );
                  const currentStep = getStepById(project.current_step_id);
                  const fileCount = Object.values(project.files ?? {}).flat().length;
                  const daysLeft = getDaysLeft(project.target_date);

                  return (
                    <button
                      key={project.id}
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setSelectedPhaseId(currentStep.phaseId);
                        setSelectedStepId(project.current_step_id ?? "1-1");
                      }}
                      className="rounded-3xl border bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg"
                    >
                      <div className="mb-5 flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                          📁
                        </div>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-[13px] font-black text-stone-700">
                          {percent}% 완료
                        </span>
                      </div>

                      <h3 className="mb-2 text-xl font-black">{project.name}</h3>

                      <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                        <p className="text-[10px] font-black text-blue-500">현재 단계</p>
                        <p className="mt-1 text-[15px] font-black text-blue-900">
                          {currentStep.icon} {currentStep.title}
                        </p>
                        <p className="mt-1 text-[13px] font-extrabold text-blue-600">
                          담당부서: {currentStep.department}
                        </p>
                      </div>

                      <div className="mb-4 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-stone-100 p-3">
                          <p className="text-[10px] font-black text-stone-700">출시목표일</p>
                          <p className="mt-1 text-[13px] font-black text-stone-700">
                            {project.target_date || "미설정"}
                          </p>
                        </div>

                        <div
                          className={`rounded-2xl p-3 ${
                            daysLeft === null
                              ? "bg-stone-100"
                              : daysLeft < 0
                              ? "bg-red-50"
                              : daysLeft <= 7
                              ? "bg-orange-50"
                              : "bg-green-50"
                          }`}
                        >
                          <p className="text-[10px] font-black text-stone-700">남은 기간</p>
                          <p
                            className={`mt-1 text-[13px] font-black ${
                              daysLeft === null
                                ? "text-stone-700"
                                : daysLeft < 0
                                ? "text-red-600"
                                : daysLeft <= 7
                                ? "text-orange-600"
                                : "text-green-700"
                            }`}
                          >
                            {daysLeft === null
                              ? "미설정"
                              : daysLeft < 0
                              ? `${Math.abs(daysLeft)}일 지연`
                              : `D-${daysLeft}`}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3 flex gap-2">
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-[13px] font-black text-stone-700">
                          첨부파일 {fileCount}개
                        </span>
                      </div>

                      <p className="text-[14px] font-extrabold text-stone-700">
                        생성일 {project.created_at.slice(0, 10)}
                      </p>

                      <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
      <main style={{ fontFamily: UI_FONT }} className="flex min-h-screen flex-col bg-[#f4f7fb] pt-12 text-[15px] font-semibold text-slate-950 antialiased">
      <WorkspaceNav active="product" userName={currentUserName} onLogout={handleLogout} />
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedProjectId(null);
                setSelectedStepId(null);
                window.history.replaceState({}, "", "/");
              }}
              className="rounded-2xl bg-stone-100 px-4 py-2.5 text-[14px] font-black text-stone-800 hover:bg-stone-200"
            >
              ← 목록
            </button>

            <div>
              <h1 className="text-xl font-black">{selectedProject.name}</h1>
              <p className="text-[14px] font-extrabold text-stone-700">
                출시목표일: {selectedProject.target_date || "미설정"} / 진행률 {progress}%
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <span className="text-[15px] font-black text-blue-600">{progress}%</span>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
            </div>

            <button
              onClick={() => router.push("/calendar")}
              className="rounded-xl bg-blue-100 px-4 py-2 text-[15px] font-black text-blue-700"
            >
              캘린더
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl bg-green-100 px-4 py-2 text-[15px] font-black text-green-700"
            >
              대시보드
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl bg-stone-100 px-4 py-2 text-[15px] font-black text-stone-700"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="border-b bg-blue-600 px-5 py-4 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-black text-blue-100">현재 진행 단계</p>
            <p className="mt-1 text-xl font-black">
              {selectedProjectCurrentStep.icon} {selectedProjectCurrentStep.title}
            </p>
            <p className="mt-1 text-[15px] font-extrabold text-blue-50">
              담당부서: {selectedProjectCurrentStep.department}
            </p>
          </div>

          {isAdmin ? (
            <button
              onClick={() => moveCurrentStep(selectedStepId ?? selectedProjectCurrentStep.id)}
              className="rounded-2xl bg-white px-5 py-3 text-[15px] font-black text-blue-600"
            >
              선택한 단계를 현재 단계로 지정
            </button>
          ) : (
            <div className="rounded-2xl bg-blue-500 px-5 py-3 text-[15px] font-black text-blue-50">
              보기 전용
            </div>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[260px_1fr_420px]">
        <aside className="border-b bg-white p-4 lg:border-b-0 lg:border-r">
          <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-2">
            {PHASES.map((phase) => (
              <button
                key={phase.id}
                onClick={() => {
                  setSelectedPhaseId(phase.id);
                  setSelectedStepId(null);
                }}
                className={`min-w-[190px] rounded-2xl px-4 py-3 text-left text-[15px] font-black lg:w-full ${
                  selectedPhaseId === phase.id
                    ? "bg-blue-600 text-white"
                    : "bg-stone-100 text-stone-700"
                }`}
              >
                <p className="text-[10px] opacity-70">PHASE {phase.id}</p>
                {phase.title}
              </button>
            ))}
          </div>
        </aside>

        <section className="p-5">
          <div className="mb-5">
            <p className="text-[13px] font-black text-blue-600">PHASE {selectedPhaseId}</p>
            <h2 className="mt-1 text-2xl font-black">
              {PHASES.find((phase) => phase.id === selectedPhaseId)?.title}
            </h2>
          </div>

          <div className="space-y-3">
            {currentSteps.map((step) => {
              const isCompleted = selectedProject.completed_step_ids.includes(step.id);
              const owner = getOwnerDisplayName(selectedProject.owners?.[step.id]);
              const isCurrentStep = selectedProject.current_step_id === step.id;
              const isStepOwner = isCurrentUserStepOwner(step.id);
              const stepFiles = selectedProject.files?.[step.id] ?? [];

              return (
                <button
                  key={step.id}
                  onClick={() => setSelectedStepId(step.id)}
                  className={`w-full rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:border-blue-400 ${
                    selectedStepId === step.id
                      ? "border-blue-500 ring-4 ring-blue-100"
                      : isCurrentStep
                      ? "border-blue-500 bg-blue-50"
                      : "border-stone-400"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f6f3ee] text-3xl">
                      {step.icon}
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black">{step.title}</h3>

                        {isCurrentStep && (
                          <span className="rounded-full bg-blue-600 px-3 py-1 text-[10px] font-black text-white">
                            현재 단계
                          </span>
                        )}

                        {isStepOwner && (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-[10px] font-black text-green-700">
                            내 담당
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-[13px] font-extrabold text-stone-700">
                        담당부서: {step.department}
                      </p>
                      <p className="mt-1 text-[13px] font-extrabold text-stone-700">
                        담당자: {owner}
                      </p>
                      <p className="mt-1 text-[13px] font-extrabold text-stone-700">
                        첨부파일: {stepFiles.length}개
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[13px] font-black ${
                        isCompleted
                          ? "bg-blue-100 text-blue-700"
                          : "bg-stone-100 text-stone-700"
                      }`}
                    >
                      {isCompleted ? "완료" : "진행 전"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="border-t bg-white p-5 lg:border-l lg:border-t-0">
          {!selectedStep ? (
            <div className="flex h-full min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-stone-400 bg-[#f6f3ee] text-center">
              <div>
                <p className="text-5xl">📍</p>
                <p className="mt-4 text-[15px] font-extrabold text-stone-700">
                  업무 단계를 선택하면<br />상세 정보가 표시됩니다.
                </p>
              </div>
            </div>
          ) : (
            <div>
              {(() => {
                const isStepOwner = isCurrentUserStepOwner(selectedStep.id);
                const canEditStep = isAdmin || isStepOwner;
                const ownerDisplayName = getOwnerDisplayName(
                  selectedProject.owners?.[selectedStep.id]
                );
                const assignableProfiles = getAssignableProfilesForStep(selectedStep);
                const stepFiles = selectedProject.files?.[selectedStep.id] ?? [];

                return (
                  <>
                    <div className="mb-6">
                      <p className="text-4xl">{selectedStep.icon}</p>
                      <h2 className="mt-3 text-2xl font-black">{selectedStep.title}</h2>

                      <div className="mt-3 space-y-2">
                        <p className="rounded-xl bg-stone-100 px-4 py-3 text-[13px] font-black text-stone-700">
                          STEP ID: {selectedStep.id}
                        </p>
                        <p className="rounded-xl bg-blue-50 px-4 py-3 text-[13px] font-black text-blue-700">
                          담당부서: {selectedStep.department}
                        </p>
                        <p
                          className={`rounded-xl px-4 py-3 text-[13px] font-black ${
                            canEditStep
                              ? "bg-green-50 text-green-700"
                              : "bg-stone-100 text-stone-700"
                          }`}
                        >
                          권한: {canEditStep ? "수정 가능" : "보기 전용"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-5">
                      {isAdmin && (
                        <button
                          onClick={() => moveCurrentStep(selectedStep.id)}
                          className={`w-full rounded-2xl py-4 text-[15px] font-black shadow-lg active:scale-95 ${
                            selectedProject.current_step_id === selectedStep.id
                              ? "bg-blue-100 text-blue-700 shadow-none"
                              : "bg-blue-600 text-white shadow-blue-600/20"
                          }`}
                        >
                          {selectedProject.current_step_id === selectedStep.id
                            ? "현재 진행 단계입니다"
                            : "이 단계를 현재 단계로 지정"}
                        </button>
                      )}

                      <div>
                        <label className="mb-2 block text-[13px] font-black text-stone-700">
                          담당자
                        </label>

                        {isAdmin ? (
                          <>
                            <select
                              value={selectedProject.owners?.[selectedStep.id] || ""}
                              onChange={(event) => updateOwner(selectedStep.id, event.target.value)}
                              className="w-full rounded-2xl border border-stone-400 bg-[#f6f3ee] px-4 py-3 text-[15px] font-extrabold outline-none focus:border-blue-500 focus:bg-white"
                            >
                              <option value="">담당자 미정</option>
                              {assignableProfiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name || "이름 없음"}{" "}
                                  {profile.position ? `${profile.position}` : ""}
                                  {profile.department ? ` / ${profile.department}` : ""}
                                  {profile.email ? ` (${profile.email})` : ""}
                                </option>
                              ))}
                            </select>

                            {assignableProfiles.length === 0 && (
                              <p className="mt-2 text-[13px] font-extrabold text-red-500">
                                이 단계 담당부서에 승인된 사용자가 없습니다.
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="rounded-2xl border border-stone-400 bg-[#f6f3ee] px-4 py-3 text-[15px] font-extrabold text-stone-700">
                            {ownerDisplayName}
                          </div>
                        )}
                      </div>

                      {selectedStep.id === "1-1" && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-[13px] font-black text-stone-700">
                              품목 선택 <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={selectedProject.notes?.[PLANNING_ITEM_NOTE_KEY] || ""}
                              onChange={(event) => {
                                const nextItem = event.target.value;
                                updateProject({
                                  ...selectedProject,
                                  notes: {
                                    ...(selectedProject.notes ?? {}),
                                    [PLANNING_ITEM_NOTE_KEY]: nextItem,
                                    [PLANNING_SPECIES_NOTE_KEY]: "",
                                  },
                                });
                              }}
                              disabled={!canEditStep}
                              className={`w-full rounded-2xl border px-4 py-3 text-[15px] font-extrabold outline-none ${
                                canEditStep
                                  ? "border-stone-400 bg-[#f6f3ee] focus:border-blue-500 focus:bg-white"
                                  : "border-stone-100 bg-stone-100 text-stone-700"
                              }`}
                            >
                              <option value="">품목을 선택하세요</option>
                              {Object.keys(ITEM_OPTIONS).map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-2 block text-[13px] font-black text-stone-700">
                              품종 선택 <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={selectedProject.notes?.[PLANNING_SPECIES_NOTE_KEY] || ""}
                              onChange={(event) => updateNote(PLANNING_SPECIES_NOTE_KEY, event.target.value)}
                              disabled={!canEditStep || !selectedProject.notes?.[PLANNING_ITEM_NOTE_KEY]}
                              className={`w-full rounded-2xl border px-4 py-3 text-[15px] font-extrabold outline-none ${
                                canEditStep && selectedProject.notes?.[PLANNING_ITEM_NOTE_KEY]
                                  ? "border-stone-400 bg-[#f6f3ee] focus:border-blue-500 focus:bg-white"
                                  : "border-stone-100 bg-stone-100 text-stone-700"
                              }`}
                            >
                              <option value="">품종을 선택하세요</option>
                              {(ITEM_OPTIONS[selectedProject.notes?.[PLANNING_ITEM_NOTE_KEY] || ""] ?? []).map(
                                (species) => (
                                  <option key={species} value={species}>
                                    {species}
                                  </option>
                                )
                              )}
                            </select>
                            <p className="mt-2 text-[13px] font-extrabold text-stone-700">
                              상품맵 카테고리 자동 분류 기준으로 사용됩니다.
                            </p>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="mb-2 block text-[13px] font-black text-stone-700">
                          업무 메모
                        </label>
                        <textarea
                          value={selectedProject.notes?.[selectedStep.id] || ""}
                          onChange={(event) => updateNote(selectedStep.id, event.target.value)}
                          placeholder="업무 진행 내용, 이슈, 결정사항을 기록하세요."
                          disabled={!canEditStep}
                          className={`h-36 w-full resize-none rounded-2xl border px-4 py-3 text-[15px] font-medium outline-none ${
                            canEditStep
                              ? "border-stone-400 bg-[#f6f3ee] focus:border-blue-500 focus:bg-white"
                              : "border-stone-100 bg-stone-100 text-stone-700"
                          }`}
                        />
                      </div>

                      {selectedStep.id === "1-3" && (
                        <div>
                          <label className="mb-2 block text-[13px] font-black text-stone-700">
                            예상 TAG가
                          </label>
                          <div className="relative">
                            <input
                              value={selectedProject.notes?.[EXPECTED_TAG_PRICE_NOTE_KEY] || ""}
                              onChange={(event) =>
                                updateNote(EXPECTED_TAG_PRICE_NOTE_KEY, event.target.value)
                              }
                              placeholder="예: 899,000"
                              disabled={!canEditStep}
                              inputMode="numeric"
                              className={`w-full rounded-2xl border px-4 py-3 pr-12 text-[15px] font-extrabold outline-none ${
                                canEditStep
                                  ? "border-stone-400 bg-[#f6f3ee] focus:border-blue-500 focus:bg-white"
                                  : "border-stone-100 bg-stone-100 text-stone-700"
                              }`}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-black text-stone-700">
                              원
                            </span>
                          </div>
                          <p className="mt-2 text-[13px] font-extrabold text-stone-700">
                            상품맵과 온라인 타겟 가격 검토 기준으로 사용할 예상 TAG가입니다.
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="mb-2 block text-[13px] font-black text-stone-700">
                          첨부파일
                        </label>

                        {selectedStep.id === "1-1" ? (
                          <div className="space-y-4">
                            <FileUploadSection
                              title="기획서 업로드"
                              description="상품기획서, 시장조사표, 가격 검토 자료 등"
                              files={stepFiles.filter((file) => (file.fileGroup || "general") === "plan")}
                              canEditStep={canEditStep}
                              uploading={uploading}
                              accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.hwp,.hwpx,.csv,image/*"
                              onUpload={(event) => handleFileUpload(event, selectedStep.id, "plan")}
                              onDrop={(event) => handleFileDrop(event, selectedStep.id, "plan")}
                              onRemove={(file) => removeFile(selectedStep.id, file)}
                            />

                            <FileUploadSection
                              title="샘플 이미지 업로드"
                              description="권장: 1200×1200px 이상 / JPG, PNG, WEBP"
                              files={stepFiles.filter((file) => (file.fileGroup || "general") === "sample")}
                              canEditStep={canEditStep}
                              uploading={uploading}
                              accept="image/*"
                              onUpload={(event) => handleFileUpload(event, selectedStep.id, "sample")}
                              onDrop={(event) => handleFileDrop(event, selectedStep.id, "sample")}
                              onRemove={(file) => removeFile(selectedStep.id, file)}
                            />

                            {stepFiles.filter((file) => !file.fileGroup || file.fileGroup === "general").length > 0 && (
                              <FileUploadSection
                                title="기존 일반 첨부파일"
                                description="분리 업로드 적용 전 등록된 파일입니다."
                                files={stepFiles.filter((file) => !file.fileGroup || file.fileGroup === "general")}
                                canEditStep={canEditStep}
                                uploading={uploading}
                                accept="*"
                                onUpload={(event) => handleFileUpload(event, selectedStep.id, "general")}
                                onDrop={(event) => handleFileDrop(event, selectedStep.id, "general")}
                                onRemove={(file) => removeFile(selectedStep.id, file)}
                              />
                            )}
                          </div>
                        ) : (
                          <FileUploadSection
                            title="파일 업로드"
                            description="업무 관련 파일을 등록하세요."
                            files={stepFiles}
                            canEditStep={canEditStep}
                            uploading={uploading}
                            accept="*"
                            onUpload={(event) => handleFileUpload(event, selectedStep.id, "general")}
                            onDrop={(event) => handleFileDrop(event, selectedStep.id, "general")}
                            onRemove={(file) => removeFile(selectedStep.id, file)}
                          />
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-[13px] font-black text-stone-700">
                          완료일
                        </label>
                        <div className="rounded-2xl border border-stone-400 bg-[#f6f3ee] px-4 py-3 text-[15px] font-extrabold text-stone-700">
                          {selectedProject.dates?.[selectedStep.id] || "아직 완료되지 않음"}
                        </div>
                      </div>

                      <button
                        onClick={() => toggleStepComplete(selectedStep.id)}
                        disabled={!canEditStep}
                        className={`w-full rounded-2xl py-4 text-[15px] font-black shadow-lg active:scale-95 ${
                          !canEditStep
                            ? "cursor-not-allowed bg-stone-100 text-stone-700 shadow-none"
                            : selectedProject.completed_step_ids.includes(selectedStep.id)
                            ? "bg-stone-100 text-stone-700 shadow-none"
                            : "bg-blue-600 text-white shadow-blue-600/20"
                        }`}
                      >
                        {!canEditStep
                          ? "담당자 또는 관리자만 완료 처리 가능"
                          : selectedProject.completed_step_ids.includes(selectedStep.id)
                          ? "완료 취소하기"
                          : "이 단계 완료 처리"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function FileUploadSection({
  title,
  description,
  files,
  canEditStep,
  uploading,
  accept,
  onUpload,
  onDrop,
  onRemove,
}: {
  title: string;
  description: string;
  files: ProjectFile[];
  canEditStep: boolean;
  uploading: boolean;
  accept: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRemove: (file: ProjectFile) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEditStep || uploading) return;
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEditStep || uploading) return;
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const currentTarget = event.currentTarget;
    const relatedTarget = event.relatedTarget as Node | null;

    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (!canEditStep || uploading) return;
    onDrop(event);
  };

  const dropZoneClassName = `mb-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center text-[15px] font-black transition ${
    isDragging
      ? "border-blue-600 bg-blue-100 text-blue-800 ring-4 ring-blue-100"
      : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
  }`;

  return (
    <div className="rounded-2xl border border-stone-400 bg-white p-4">
      <div className="mb-3">
        <p className="text-[15px] font-black text-stone-800">{title}</p>
        <p className="mt-1 text-[13px] font-extrabold text-stone-700">{description}</p>
      </div>

      {canEditStep && (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={dropZoneClassName}
        >
          <label className="flex w-full cursor-pointer flex-col items-center justify-center">
            <span>{uploading ? "업로드 중..." : `+ ${title}`}</span>
            <span className="mt-1 text-[13px] font-extrabold text-blue-500">
              클릭 또는 파일을 여기로 드래그해서 업로드
            </span>
            <input
              type="file"
              multiple
              accept={accept}
              className="hidden"
              disabled={uploading}
              onChange={onUpload}
            />
          </label>
        </div>
      )}

      <div className="space-y-2">
        {files.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-400 bg-[#f6f3ee] px-4 py-8 text-center text-[13px] font-extrabold text-stone-700">
            등록된 파일이 없습니다.
          </div>
        ) : (
          files.map((file) => (
            <div key={file.id} className="rounded-2xl border border-stone-400 bg-[#f6f3ee] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-black text-stone-800">📎 {file.name}</p>
                  <p className="mt-1 text-[11px] font-bold text-stone-700">
                    업로드: {file.uploadedBy} / {file.uploadedAt.slice(0, 10)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-white px-3 py-2 text-[13px] font-black text-blue-600 shadow-sm"
                  >
                    보기
                  </a>

                  {canEditStep && (
                    <button
                      type="button"
                      onClick={() => onRemove(file)}
                      className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-black text-red-600"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
