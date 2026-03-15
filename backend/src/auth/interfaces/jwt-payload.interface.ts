export interface JwtPayload {
  sub: string; // user_id
  email: string;
  display_name: string;
  groups: string[];
  tenant_id: string;
  role: string; // 'admin' | 'user'
  auth_method: string; // 'local' | 'oidc'
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // user_id
  tenant_id: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}
