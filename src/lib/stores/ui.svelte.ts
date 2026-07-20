// Rune-based UI store: sidebar open, dark mode, density, active view, search.
export type Layout = 'grid' | 'list';
export type View = 'notes' | 'kanban' | 'reminders' | 'archive' | 'trash' | 'label';

interface UIState {
	sidebarOpen: boolean;
	dark: boolean | null; // null = follow system
	layout: Layout;
	view: View;
	activeLabelId: string | null;
	search: string;
	composerFocused: boolean;
	settingsOpen: boolean;
}

function prefersDark(): boolean {
	if (typeof matchMedia === 'undefined') return false;
	return matchMedia('(prefers-color-scheme: dark)').matches;
}

const LS_KEY = 'gkc-ui-state';

export class UIStore {
	sidebarOpen = $state(true);
	dark = $state<boolean | null>(null);
	layout = $state<Layout>('grid');
	view = $state<View>('notes');
	activeLabelId = $state<string | null>(null);
	// Ephemeral route-feedback state; never persisted across a reload.
	pendingPath = $state<string | null>(null);
	search = $state('');
	composerFocused = $state(false);
	settingsOpen = $state(false);

	constructor() {
		if (typeof localStorage !== 'undefined') {
			try {
				const raw = localStorage.getItem(LS_KEY);
				if (raw) {
					const parsed = JSON.parse(raw) as Partial<UIState>;
					if (typeof parsed.sidebarOpen === 'boolean') this.sidebarOpen = parsed.sidebarOpen;
					if (typeof parsed.dark === 'boolean' || parsed.dark === null) this.dark = parsed.dark;
					if (parsed.layout === 'grid' || parsed.layout === 'list') this.layout = parsed.layout;
					if (typeof parsed.view === 'string') this.view = parsed.view as View;
				}
			} catch {
				/* ignore */
			}
		}
		if (this.dark === null && typeof matchMedia !== 'undefined') {
			this.dark = prefersDark();
		}

		// Persist on change.
		$effect.root(() => {
			$effect(() => {
				const snap: Partial<UIState> = {
					sidebarOpen: this.sidebarOpen,
					dark: this.dark,
					layout: this.layout,
					view: this.view
				};
				if (typeof localStorage !== 'undefined') {
					localStorage.setItem(LS_KEY, JSON.stringify(snap));
				}
			});
		});

		// Watch system theme changes when following system.
		if (typeof matchMedia !== 'undefined') {
			const mq = matchMedia('(prefers-color-scheme: dark)');
			mq.addEventListener?.('change', (e) => {
				// Only auto-switch if user hasn't manually toggled (stored preference is null).
				const raw = localStorage.getItem(LS_KEY);
				const parsed = raw ? (JSON.parse(raw) as Partial<UIState>) : {};
				if (parsed.dark == null) this.dark = e.matches;
			});
		}
	}

	get effectiveDark(): boolean {
		return this.dark ?? prefersDark();
	}

	toggleSidebar() {
		this.sidebarOpen = !this.sidebarOpen;
	}

	toggleDark() {
		this.dark = !this.effectiveDark;
	}

	toggleLayout() {
		this.layout = this.layout === 'grid' ? 'list' : 'grid';
	}

	setView(view: View, labelId: string | null = null) {
		this.view = view;
		this.activeLabelId = labelId;
		this.search = '';
	}

	focusComposer() {
		this.composerFocused = true;
	}
}

export const uiStore = new UIStore();