// Kütüphane kimliği → bileşen. Gömülü widget gövdeleri (registry "embed") EmbedTile ile çizilir.
import { REGISTRY } from "../registry";
import { ActionTile, CalcTile, CountdownTile, DownloadTile, JobsTile, NewProjectTile, QuickLedgerTile, QuickNoteTile, QuickTodoTile, ScreenshotTile } from "./quick";
import { MatchesTile, StaffMatchesTile } from "./sport";
import { AccountsTile, BalanceTile, BudgetTile, LedgerListTile, ReceivablesTile, RecurringTile, TrendTile } from "./money";
import { FollowupsTile, GanttTile, ProjectsTile, StagesTile } from "./projects";
import { CountsTile, EquipmentTile, NotesTile, TodosTile, UpcomingTile } from "./work";
import { MessagesTile, RequestsTile, SyncTile } from "./comm";
import { FocusTile, HeroTile } from "./info";
import { LauncherTile, LinkTile, RouteTile, ToolkitTile } from "./access";
import { EmbedTile } from "./embed";
import { DataTile } from "./data";
import { BarTile, ButtonTile, FolderTile } from "./button";
import { BrowserSearchTile, ChecklistTile, DateTile, HeadingTile, ImageTile, LedgerPresetTile, MusicListTile, NoteChecklistTile, PinnedNoteTile, PinnedVideoTile, QuickTodoPhaseTile, SpacerTile, TextTile } from "./extra";

const NATIVE = {
  download: DownloadTile, jobs: JobsTile, quicktodo: QuickTodoTile, quicknote: QuickNoteTile, quickledger: QuickLedgerTile, newproject: NewProjectTile,
  screenshot: ScreenshotTile, calc: CalcTile, action: ActionTile, countdown: CountdownTile,
  matches: MatchesTile, staffmatches: StaffMatchesTile,
  balance: BalanceTile, trend: TrendTile, recurring: RecurringTile, budget: BudgetTile, accounts: AccountsTile, receivables: ReceivablesTile, ledgerlist: LedgerListTile,
  stages: StagesTile, projects: ProjectsTile, followups: FollowupsTile, gantt: GanttTile,
  todos: TodosTile, upcoming: UpcomingTile, notes: NotesTile, equipment: EquipmentTile, counts: CountsTile,
  messages: MessagesTile, requests: RequestsTile, sync: SyncTile,
  hero: HeroTile, focus: FocusTile,
  route: RouteTile, link: LinkTile, launcher: LauncherTile, toolkit: ToolkitTile,
  // tur 5 aileleri (registry "impl")
  data: DataTile, button: ButtonTile, bar: BarTile, folder: FolderTile, preset: LedgerPresetTile,
  text: TextTile, heading: HeadingTile, spacer: SpacerTile, image: ImageTile, date: DateTile,
  checklist: ChecklistTile, notechecklist: NoteChecklistTile, pinnote: PinnedNoteTile, bsearch: BrowserSearchTile, bvideo: PinnedVideoTile,
  todophase: QuickTodoPhaseTile, musiclist: MusicListTile,
};

export const IMPLS = Object.fromEntries(REGISTRY.map((m) => [m.id, m.embed ? EmbedTile : NATIVE[m.impl || m.id]]).filter(([, c]) => c));
export const implOf = (id) => IMPLS[id] || null;
