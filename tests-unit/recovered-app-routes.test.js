import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../src/SidebarRail.css', import.meta.url), 'utf8');
const habitStyleSource = readFileSync(new URL('../src/HabitReference.css', import.meta.url), 'utf8');

test('recovered app retains authenticated routes and restores community and academy pages', () => {
  for (const path of ['/app', '/app/academia', '/app/habitos', '/app/metas', '/app/leituras', '/app/amigos', '/app/analises', '/app/perfil', '/app/configuracoes']) {
    const escapedPath = path.replaceAll('/', '\\/');
    assert.match(appSource, new RegExp(`<Route path="${escapedPath}" element=\\{<RequireAuth>`));
  }
  assert.match(appSource, /<Route path="\/pessoas" element=\{<PublicProfileFinderPage \/>\}/);
  assert.match(appSource, /<Route path="\/u\/:username" element=\{<PublicProfilePage \/>\}/);
  assert.match(appSource, /const AcademyPageModule = lazy\(\(\) => import\('\.\/pages\/AcademyPage\.jsx'\)\)/);
  assert.match(appSource, /const HabitsPageModule = lazy\(\(\) => import\('\.\/pages\/habits\/HabitsPage\.jsx'\)\)/);
  assert.match(appSource, /const ReadingPageModule = lazy\(\(\) => import\('\.\/pages\/reading\/ReadingPageView\.jsx'\)\)/);
  assert.match(appSource, /function HabitsRoutePage\(\)/);
  assert.doesNotMatch(appSource, /className="habits-reference-theme"/);
  assert.match(appSource, /function ReadingRoutePage\(\)/);
  assert.match(appSource, /function SettingsPage\(\)/);
});

test('recovered navigation keeps the icon rail on desktop and five primary mobile destinations', () => {
  const mobileNavStart = appSource.indexOf('<nav className="mobile-nav"');
  const mobileNavEnd = appSource.indexOf('</nav>', mobileNavStart);
  const mobileNav = appSource.slice(mobileNavStart, mobileNavEnd);

  for (const path of ['/app/habitos', '/app/academia', '/app', '/app/leituras', '/app/metas']) {
    assert.ok(mobileNav.includes(`to="${path}"`), `${path} remains on the mobile primary navigation`);
  }
  assert.match(sidebarSource, /\.sidebar-brand-star\s*\{[^}]*display:\s*block;[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
  assert.match(sidebarSource, /grid-template-columns:\s*84px minmax\(0,\s*1fr\)/);
  assert.match(sidebarSource, /\.page-header \.header-action > \.button\s*\{[^}]*width:\s*100%/s);
  assert.match(sidebarSource, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(sidebarSource, /@media\s*\(max-width:\s*980px\)/);
  assert.match(habitStyleSource, /\.habit-overview-card\s*\{/);
  assert.match(habitStyleSource, /\.habit-filter-row\s*\{[^}]*grid-template-columns:\s*40px minmax\(0,\s*1fr\) 40px/s);
  assert.match(habitStyleSource, /\.habit-overview-card\s*\{[^}]*flex:\s*1 1 calc\(50% - 4px\)/s);
  assert.match(habitStyleSource, /\.habit-status-switch\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  const desktopStart = habitStyleSource.indexOf('@media (min-width: 981px)');
  const mobileStart = habitStyleSource.indexOf('@media (max-width: 420px)', desktopStart);
  const desktopHabitStyles = habitStyleSource.slice(desktopStart, mobileStart);
  const mobileHabitStyles = habitStyleSource.slice(mobileStart);
  assert.match(desktopHabitStyles, /\.habit-filter-row\s*\{[^}]*grid-template-columns:\s*36px minmax\(0,\s*1fr\) 36px;[^}]*min-height:\s*36px;/s);
  assert.match(mobileHabitStyles, /\.habit-filter-row\s*\{[^}]*grid-template-columns:\s*36px minmax\(0,\s*1fr\) 36px;/s);
});
