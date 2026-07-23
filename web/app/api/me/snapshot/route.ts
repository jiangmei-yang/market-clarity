import { NextResponse } from "next/server";
import { deleteUserSnapshot, readUserSnapshot, writeUserSnapshot } from "../../../lib/user-snapshot";

export async function GET() {
  try {
    const result = await readUserSnapshot();
    if (result.status === "unauthorized") return NextResponse.json({ message: "请先登录" }, { status: 401 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ status: "unavailable", message: error instanceof Error ? error.message : "云端个人数据暂不可用" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const snapshot = await request.json();
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return NextResponse.json({ message: "个人数据格式无效" }, { status: 400 });
    const result = await writeUserSnapshot(snapshot);
    if (result.status === "unauthorized") return NextResponse.json({ message: "请先登录" }, { status: 401 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ status: "unavailable", message: error instanceof Error ? error.message : "保存失败" }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const result = await deleteUserSnapshot();
    if (result.status === "unauthorized") return NextResponse.json({ message: "请先登录" }, { status: 401 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ status: "unavailable", message: error instanceof Error ? error.message : "删除失败" }, { status: 503 });
  }
}
