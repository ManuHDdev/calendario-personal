export interface UserOut {
  id: string;
  username: string;
  email: string;
  enabled: boolean;
  roles: string[];
}

export interface UserFormData {
  username: string;
  email: string;
  password: string;
  roles: string[];
  enabled: boolean;
}
