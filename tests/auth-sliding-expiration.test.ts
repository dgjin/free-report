import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// JWT 滑动过期契约：token 剩余有效期低于阈值时，服务端随响应头 X-Refreshed-Token 下发新 token，
// 前端无感替换，避免活跃使用中突然掉线。链路任一环断裂都会让机制失效，故整体守护。
const serverRoot = new URL('../server-springboot/src/main/', import.meta.url);
const readServer = (relative: string) => fs.readFileSync(new URL(relative, serverRoot), 'utf8');
const readClient = (relative: string) => fs.readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8');

const tokenProvider = readServer('java/com/freereport/security/JwtTokenProvider.java');
const authFilter = readServer('java/com/freereport/security/JwtAuthFilter.java');
const webConfig = readServer('java/com/freereport/config/WebConfig.java');
const applicationYml = readServer('resources/application.yml');
const apiClient = readClient('services/api.ts');

test('续签阈值可配置且有默认值', () => {
  assert.match(applicationYml, /renewal-threshold:\s*\$\{JWT_RENEWAL_THRESHOLD:\d+\}/);
  assert.match(tokenProvider, /@Value\("\$\{jwt\.renewal-threshold:\d+\}"\)/);
});

test('JwtTokenProvider 提供剩余有效期判断', () => {
  assert.match(tokenProvider, /boolean needsRenewal\(String token\)/);
  assert.match(tokenProvider, /claims\.getExpiration\(\)/);
});

test('JwtAuthFilter 校验通过后在响应头下发新 token', () => {
  assert.match(authFilter, /X-Refreshed-Token/);
  assert.match(authFilter, /needsRenewal\(token\)/);
  assert.match(authFilter, /response\.setHeader\(REFRESHED_TOKEN_HEADER, jwtTokenProvider\.generateToken\(authUser\)\)/);
});

test('CORS 暴露续签响应头，跨域前端可读', () => {
  assert.match(webConfig, /\.exposedHeaders\("X-Refreshed-Token"\)/);
});

test('前端请求封装读取续签头并无感替换 token', () => {
  assert.match(apiClient, /res\.headers\.get\('X-Refreshed-Token'\)/);
  assert.match(apiClient, /setToken\(refreshedToken\)/);
});
