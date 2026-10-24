import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { workspace as ws } from '../../workspace';
import {
  groupBundledScores,
  selectBundledVersion,
  bundledVersionLabel,
  matchesBundledWork,
  type BundledWork,
} from '../../platform/bundled-library';
import { Icon } from '../../shared/ui/Icon';
import { bundledTrack, ListenButton } from './LibraryPlayback';
import { ScoreThumbnail } from './ScoreThumbnail';
import { ScoreMenu } from './ScoreMenu';
const run = (fn: () => unknown | Promise<unknown>) => () => void ws.run(fn);

export function BundledSongs({
  search = '',
  practice = false,
}: {
  search?: string;
  practice?: boolean;
}) {
  const state = useSyncExternalStore(ws.subscribe, ws.snapshot),
    songs = useMemo(
      () =>
        groupBundledScores(state.bundledScores).filter((work) => matchesBundledWork(work, search)),
      [state.bundledScores, search],
    );
  if (!songs.length) return null;
  return (
    <section className="bundled-library" aria-label="Bài hát có sẵn">
      <div className="section-top">
        <h2>
          Bài hát có sẵn <span>{songs.length}</span>
        </h2>
        <span className="muted">Mở một bài để lưu bản riêng trên thiết bị</span>
      </div>
      <div className="score-grid">
        {songs.map((work) => (
          <BundledSongCard key={work.id} work={work} practice={practice} />
        ))}
      </div>
    </section>
  );
}

function BundledSongCard({ work, practice }: { work: BundledWork; practice: boolean }) {
  const preference = 'pianist-bundled-version:' + work.id;
  const [selected, setSelected] = useState(() => {
    try {
      return localStorage.getItem(preference) ?? undefined;
    } catch {
      return undefined;
    }
  });
  const song = selectBundledVersion(work, selected),
    canPractice = song.practiceReady !== false;
  const track = bundledTrack(song);
  const choose = (id: string) => {
    if (ws.libraryPlayer.activitySnapshot().id === 'bundled:' + song.id) ws.libraryPlayer.stop();
    setSelected(id);
    try {
      localStorage.setItem(preference, id);
    } catch {
      /* Selecting remains available when storage is full or disabled. */
    }
  };
  return (
    <article className="score-card" data-work-id={work.id}>
      <button
        className="score-cover"
        aria-label={'Mở bài có sẵn ' + work.title}
        onClick={run(() => ws.openBundledScore(song, practice && canPractice))}
      >
        <ScoreThumbnail track={track} url={'library/previews/' + song.id + '.webp'} />
      </button>
      <div className="score-card-body">
        <ScoreMenu
          title={work.title}
          version={bundledVersionLabel(song)}
          filename={song.filename}
          onEdit={run(() => ws.openBundledScore(song))}
        />
        {work.versions.length > 1 && (
          <label className="bundled-version">
            <span>{work.versions.length} phiên bản</span>
            <select
              aria-label={'Chọn phiên bản ' + work.title}
              value={song.id}
              onChange={(e) => choose(e.target.value)}
            >
              {work.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {bundledVersionLabel(version)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!canPractice && (
          <p className="bundled-practice-notice" role="note">
            {song.practiceNotice}
          </p>
        )}
        <div className="score-actions">
          <ListenButton track={track} />
          <button
            className="primary-light"
            disabled={!canPractice}
            title={canPractice ? undefined : song.practiceNotice}
            onClick={run(() => ws.openBundledScore(song, true))}
          >
            <Icon name="play" />
            Tập
          </button>
        </div>
      </div>
    </article>
  );
}
