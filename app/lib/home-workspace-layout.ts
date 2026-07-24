import {
  DASHBOARD_MODULE_REGISTRY,
  type DashboardModule,
  type DashboardVisualization,
} from "./dashboard-system";
import {
  MODULE_LABELS,
  type ModuleType,
  type WorkspaceModule,
} from "./personal-workbench";

export type HomeWorkspaceModuleInput =
  | WorkspaceModule
  | Pick<
      DashboardModule,
      "type" | "visible" | "order" | "width" | "visualization" | "instanceId"
    >;

export type HomeSectionWidth = "full" | "half" | "third";

export type HomeSectionDataPolicy = {
  sourceIds: string[];
  allowSyntheticData: false;
  requireSourceLabel: true;
  requireTimestamp: true;
};

export type HomeSectionPlan = {
  sectionId: string;
  kind: "required" | "workspace";
  moduleType?: ModuleType;
  title: string;
  renderer:
    | "market_pulse"
    | "decision_brief"
    | `module_${DashboardVisualization}`;
  visualization?: DashboardVisualization;
  width: HomeSectionWidth;
  grid: { x: number; y: number; w: 4 | 6 | 12 };
  dataPolicy: HomeSectionDataPolicy;
};

export type HomeWorkspaceLayoutPlan = {
  schemaVersion: "market-clarity-home-v1";
  columns: 12;
  sections: HomeSectionPlan[];
  workspaceSectionCount: number;
};

const REQUIRED_HOME_SECTIONS: readonly HomeSectionPlan[] = [
  {
    sectionId: "market_pulse",
    kind: "required",
    title: "市场状态",
    renderer: "market_pulse",
    width: "full",
    grid: { x: 0, y: 0, w: 12 },
    dataPolicy: {
      sourceIds: ["market_cn"],
      allowSyntheticData: false,
      requireSourceLabel: true,
      requireTimestamp: true,
    },
  },
  {
    sectionId: "decision_brief",
    kind: "required",
    title: "决策摘要",
    renderer: "decision_brief",
    width: "full",
    grid: { x: 0, y: 1, w: 12 },
    dataPolicy: {
      sourceIds: ["user_portfolio", "workspace_state"],
      allowSyntheticData: false,
      requireSourceLabel: true,
      requireTimestamp: true,
    },
  },
] as const;

const widthColumns: Record<HomeSectionWidth, 4 | 6 | 12> = {
  full: 12,
  half: 6,
  third: 4,
};

function registeredDefinition(type: string) {
  const definition = DASHBOARD_MODULE_REGISTRY.find(
    (candidate) => candidate.moduleId === type,
  );
  if (!definition) throw new Error(`首页布局包含未注册模块：${type}`);
  return definition;
}

function normalizedVisualization(
  module: HomeWorkspaceModuleInput,
  definition: (typeof DASHBOARD_MODULE_REGISTRY)[number],
) {
  const requested =
    "visualization" in module ? module.visualization : undefined;
  if (
    requested &&
    !definition.uiSchema.visualizations.includes(requested)
  ) {
    throw new Error(
      `模块 ${module.type} 不支持 ${requested} 可视化`,
    );
  }
  return requested ?? definition.uiSchema.defaultVisualization;
}

function assertValidModule(
  module: HomeWorkspaceModuleInput,
  index: number,
) {
  if (!module || typeof module !== "object") {
    throw new Error(`首页布局模块 ${index + 1} 无效`);
  }
  const definition = registeredDefinition(String(module.type));
  if (!Number.isFinite(module.order)) {
    throw new Error(`模块 ${module.type} 缺少有效顺序`);
  }
  if (!["full", "half", "third"].includes(module.width)) {
    throw new Error(`模块 ${module.type} 的宽度无效`);
  }
  normalizedVisualization(module, definition);
  return definition;
}

function placeWorkspaceSections(sections: HomeSectionPlan[]) {
  let row = REQUIRED_HOME_SECTIONS.length;
  let usedColumns = 0;
  return sections.map((section) => {
    const columns = widthColumns[section.width];
    if (columns === 12 || usedColumns + columns > 12) {
      if (usedColumns > 0) row += 1;
      usedColumns = 0;
    }
    const placed = {
      ...section,
      grid: { x: usedColumns, y: row, w: columns },
    } satisfies HomeSectionPlan;
    usedColumns += columns;
    if (usedColumns === 12) {
      row += 1;
      usedColumns = 0;
    }
    return placed;
  });
}

/**
 * Converts the saved workspace module configuration into a deterministic,
 * render-ready home layout. This function plans presentation only; it never
 * creates market values, portfolio values, conclusions, or fallback content.
 */
export function planHomeWorkspaceLayout(
  modules: readonly HomeWorkspaceModuleInput[],
): HomeWorkspaceLayoutPlan {
  if (!Array.isArray(modules)) {
    throw new Error("首页布局需要 Workspace modules 数组");
  }

  const checked = modules.map((module, index) => ({
    module,
    index,
    definition: assertValidModule(module, index),
  }));

  const instanceIds = new Set<string>();
  for (const { module } of checked) {
    if (!("instanceId" in module) || !module.instanceId) continue;
    if (instanceIds.has(module.instanceId)) {
      throw new Error(`首页布局模块实例重复：${module.instanceId}`);
    }
    instanceIds.add(module.instanceId);
  }

  const workspaceSections = checked
    .filter(({ module }) => module.visible)
    .sort(
      (left, right) =>
        left.module.order - right.module.order || left.index - right.index,
    )
    .map(({ module, index, definition }) => {
      const visualization = normalizedVisualization(module, definition);
      const instanceId =
        "instanceId" in module && module.instanceId
          ? module.instanceId
          : `${module.type}-${index + 1}`;
      return {
        sectionId: `workspace:${instanceId}`,
        kind: "workspace",
        moduleType: module.type,
        title: MODULE_LABELS[module.type],
        renderer: `module_${visualization}`,
        visualization,
        width: module.width,
        grid: { x: 0, y: 0, w: widthColumns[module.width] },
        dataPolicy: {
          sourceIds: [...definition.dataSources],
          allowSyntheticData: false,
          requireSourceLabel: true,
          requireTimestamp: true,
        },
      } satisfies HomeSectionPlan;
    });

  const placedWorkspaceSections = placeWorkspaceSections(workspaceSections);
  return {
    schemaVersion: "market-clarity-home-v1",
    columns: 12,
    sections: [
      ...REQUIRED_HOME_SECTIONS.map((section) => ({
        ...section,
        grid: { ...section.grid },
        dataPolicy: {
          ...section.dataPolicy,
          sourceIds: [...section.dataPolicy.sourceIds],
        },
      })),
      ...placedWorkspaceSections,
    ],
    workspaceSectionCount: placedWorkspaceSections.length,
  };
}

