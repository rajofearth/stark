export type ApprovalKind = "ask" | "artifact_upload" | "github_pr" | "new_project";

export interface ApprovalRequest<T = unknown> {
  id: string;
  kind: ApprovalKind;
  channel: string;
  user: string;
  threadTs: string | null;
  summary: string;
  payload: T;
  createdAt: Date;
}

export class ApprovalStore {
  private approvals = new Map<string, ApprovalRequest>();
  private sequence = 0;

  create<T>(input: Omit<ApprovalRequest<T>, "id" | "createdAt">): ApprovalRequest<T> {
    const id = `appr-${Date.now().toString(36)}-${(++this.sequence).toString(36)}`;
    const approval: ApprovalRequest<T> = { ...input, id, createdAt: new Date() };
    this.approvals.set(id, approval);
    return approval;
  }

  get(id: string): ApprovalRequest | null {
    return this.approvals.get(id) ?? null;
  }

  consume(id: string): ApprovalRequest | null {
    const approval = this.get(id);
    if (approval) this.approvals.delete(id);
    return approval;
  }

  list(): ApprovalRequest[] {
    return [...this.approvals.values()].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
  }
}
