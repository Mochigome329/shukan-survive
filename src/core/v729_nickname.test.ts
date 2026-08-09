/**
 * v7.29: 控えキャラのニックネーム（遊び心程度の小機能）。
 * 未設定ならdef.nameを表示し、付ければゾーンが変わっても持ち続ける。
 */
import { describe, expect, it } from 'vitest';
import { createInitialDeck, createRun, PROTAGONIST_ID, setNickname, resolveWeek } from './run';
import { displayName } from './types';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

describe('setNickname', () => {
  it('対象のCardInstanceだけにnicknameをセットする', () => {
    const state = makeState([makeInstance(data, 'heroine', 1, { zone: 'bench' }), makeInstance(data, 'aibou', 1, { zone: 'bench' })]);
    const next = setNickname(data, state, 'heroine#1', 'ゆき');
    expect(next.cards.find((c) => c.instanceId === 'heroine#1')!.nickname).toBe('ゆき');
    expect(next.cards.find((c) => c.instanceId === 'aibou#1')!.nickname).toBeUndefined();
  });

  it('null・空文字・空白のみでundefinedに戻る（既定名に戻す操作を兼ねる）', () => {
    const state = makeState([makeInstance(data, 'heroine', 1, { zone: 'bench', nickname: 'ゆき' })]);
    for (const cleared of [null, '', '   ']) {
      const next = setNickname(data, state, 'heroine#1', cleared);
      expect(next.cards[0]!.nickname).toBeUndefined();
    }
  });

  it('前後の空白をトリムする', () => {
    const state = makeState([makeInstance(data, 'heroine', 1, { zone: 'bench' })]);
    const next = setNickname(data, state, 'heroine#1', '  ゆき  ');
    expect(next.cards[0]!.nickname).toBe('ゆき');
  });

  it('存在しないinstanceIdはエラーを投げる', () => {
    const state = makeState([makeInstance(data, 'heroine', 1, { zone: 'bench' })]);
    expect(() => setNickname(data, state, 'nope#1', '名前')).toThrow();
  });

  it('展開カードにはニックネームを設定できない', () => {
    const state = makeState([makeInstance(data, 'battle', 1, { zone: 'hand' })]);
    expect(() => setNickname(data, state, 'battle#1', '名前')).toThrow();
  });
});

describe('displayName', () => {
  it('ニックネームがあればそちらを返す', () => {
    const def = data.definitions.get('heroine')!;
    const instance = makeInstance(data, 'heroine', 1, { zone: 'bench', nickname: 'ゆき' });
    expect(displayName(def, instance)).toBe('ゆき');
  });

  it('未設定ならdef.nameを返す', () => {
    const def = data.definitions.get('heroine')!;
    const instance = makeInstance(data, 'heroine', 1, { zone: 'bench' });
    expect(displayName(def, instance)).toBe(def.name);
  });
});

describe('ニックネームはゾーンが変わっても持ち続ける', () => {
  it('控え→デビュー→死亡と進んでも、同じCardInstanceのnicknameが保持される', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { zone: 'bench', nickname: 'ゆき' }),
      makeInstance(data, 'shinchara', 1, { zone: 'hand' }),
    ];
    const debuted = resolveWeek(data, makeState(cards, 1), {
      cards: ['shinchara#1'],
      targets: { 'shinchara#1': 'heroine#1' },
    }).state;
    const debutedHeroine = debuted.cards.find((c) => c.instanceId === 'heroine#1')!;
    expect(debutedHeroine.zone).toBe('field');
    expect(debutedHeroine.nickname).toBe('ゆき');

    const withDeath = [...debuted.cards.filter((c) => c.instanceId !== 'shibou#1'), makeInstance(data, 'shibou', 2, { zone: 'hand' })];
    const died = resolveWeek(data, makeState(withDeath, 2), {
      cards: ['shibou#2'],
      targets: { 'shibou#2': 'heroine#1' },
    }).state;
    const deadHeroine = died.cards.find((c) => c.instanceId === 'heroine#1')!;
    expect(deadHeroine.zone).toBe('dead');
    expect(deadHeroine.nickname).toBe('ゆき');
  });
});

describe('セットアップ画面での開始時ニックネーム（v7.29）', () => {
  it('createInitialDeckがstartingNicknamesを主人公・共演者候補に反映する', () => {
    const cards = createInitialDeck(data, ['heroine', 'rival'], undefined, undefined, {
      [PROTAGONIST_ID]: 'ユウ',
      heroine: 'ミサキ',
    });
    expect(cards.find((c) => c.definitionId === PROTAGONIST_ID)!.nickname).toBe('ユウ');
    expect(cards.find((c) => c.definitionId === 'heroine')!.nickname).toBe('ミサキ');
    // 指定しなかった共演者は既定名のまま（undefined）
    expect(cards.find((c) => c.definitionId === 'rival')!.nickname).toBeUndefined();
  });

  it('控えに回ったキャラにもニックネームが付く（選ばなくても呼び名だけは決められる）', () => {
    const cards = createInitialDeck(data, ['heroine', 'rival'], undefined, undefined, { aibou: 'タロー' });
    const aibou = cards.find((c) => c.definitionId === 'aibou')!;
    expect(aibou.zone).toBe('bench');
    expect(aibou.nickname).toBe('タロー');
  });

  it('空欄・空白のみのニックネームは既定名のまま（undefined）', () => {
    const cards = createInitialDeck(data, ['heroine', 'rival'], undefined, undefined, {
      [PROTAGONIST_ID]: '',
      heroine: '   ',
    });
    expect(cards.find((c) => c.definitionId === PROTAGONIST_ID)!.nickname).toBeUndefined();
    expect(cards.find((c) => c.definitionId === 'heroine')!.nickname).toBeUndefined();
  });

  it('createRun経由でも同様にニックネームが通る', () => {
    const run = createRun(data, 1, {
      mangaTitle: 'テスト',
      startingCast: ['heroine', 'rival'],
      startingNicknames: { [PROTAGONIST_ID]: 'ユウ' },
    });
    expect(run.cards.find((c) => c.definitionId === PROTAGONIST_ID)!.nickname).toBe('ユウ');
  });

  it('省略時は誰にもニックネームが付かない（後方互換）', () => {
    const cards = createInitialDeck(data, ['heroine', 'rival']);
    expect(cards.every((c) => c.nickname === undefined)).toBe(true);
  });
});
