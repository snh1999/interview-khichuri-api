export interface IAdminFeedback {
  id: string;
  type: string;
  message: string;
  route: string;
  userAgent: string | null;
  status: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IAdminFeedbackResponse {
  items: IAdminFeedback[];
  total: number;
}
