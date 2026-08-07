import { describe, expect, it } from 'vitest';

import { chatIsInbound, chatRollTitle, chatText, parseDamageTrackingLine, parseDamageTrackingMessage } from '../../../src/domain/chat/rollLog.ts';

describe('domain/chat/rollLog', () => {
  describe('chatText', () => {
    it('decodes the HTML entities used across chat text', () => {
      expect(chatText('a &amp; b &lt;tag&gt; &quot;q&quot; &#39;s&#39; &nbsp;end')).toBe('a & b <tag> "q" \'s\'  end');
    });
    it('coerces null/undefined to an empty string', () => {
      expect(chatText(null)).toBe('');
      expect(chatText(undefined)).toBe('');
    });
  });

  describe('chatIsInbound', () => {
    it('is false for a null/undefined message', () => {
      expect(chatIsInbound(null)).toBe(false);
    });
    it('for a GM viewer, counts any non-GM message as inbound', () => {
      expect(chatIsInbound({ role: 'player', sender: 'Rook' }, { gm: true })).toBe(true);
      expect(chatIsInbound({ role: 'gm', sender: 'MESTRE' }, { gm: true })).toBe(false);
    });
    it('for a player viewer, their own messages are not inbound', () => {
      expect(chatIsInbound({ role: 'player', sender: 'Rook' }, { gm: false, activeName: 'Rook' })).toBe(false);
    });
    it('for a player viewer, messages from other players or the GM are inbound', () => {
      expect(chatIsInbound({ role: 'player', sender: 'Vesper' }, { gm: false, activeName: 'Rook' })).toBe(true);
      expect(chatIsInbound({ role: 'gm', sender: 'MESTRE' }, { gm: false, activeName: 'Rook' })).toBe(true);
    });
    it('defaults activeName to OPERATIVE when missing', () => {
      expect(chatIsInbound({ role: 'player', sender: 'OPERATIVE' }, { gm: false })).toBe(false);
    });
  });

  describe('chatRollTitle', () => {
    it('drops a leading segment that repeats the sender name', () => {
      expect(chatRollTitle('ROOK :: SMART PISTOL ATAQUE', 'ROOK')).toBe('SMART PISTOL ATAQUE');
    });
    it('keeps the label as-is when it has no "::" segments', () => {
      expect(chatRollTitle('CHECK ROLLED', 'ROOK')).toBe('CHECK ROLLED');
    });
    it('falls back to "ROLL" when the label is empty', () => {
      expect(chatRollTitle('', '')).toBe('ROLL');
    });
  });

  describe('parseDamageTrackingLine', () => {
    // Current format, produced by postDamageRollTracking.
    it('parses a BASE line with no reason segment', () => {
      expect(parseDamageTrackingLine('Wolvers :: BASE :: 3d6+2 :: ROLLS 4, 5, 6 :: SUBTOTAL 17')).toEqual({
        source: 'Wolvers', type: 'BASE', reason: '', notation: '3d6+2', faces: '4, 5, 6', subtotal: '17',
      });
    });
    it('parses a BONUS line with a reason segment', () => {
      expect(parseDamageTrackingLine('Cybereye :: BONUS :: Cyberware :: 1d6 :: ROLLS 5 :: SUBTOTAL 5')).toEqual({
        source: 'Cybereye', type: 'BONUS', reason: 'Cyberware', notation: '1d6', faces: '5', subtotal: '5',
      });
    });

    // Legacy format, kept for backward-compat parsing of old stored chat
    // messages predating postDamageRollTracking's "::" rewrite.
    it('parses a legacy "[Weapon Base]" line, normalizing the type to BASE', () => {
      expect(parseDamageTrackingLine('Smart Pistol [Weapon Base] 2d6+2 => 4, 6 = 12')).toEqual({
        source: 'Smart Pistol', type: 'BASE', reason: '', notation: '2d6+2', faces: '4, 6', subtotal: '12',
      });
    });
    it('parses a legacy "[Bonus - reason]" line, normalizing the type to BONUS and extracting the reason', () => {
      expect(parseDamageTrackingLine('Smart Pistol [Bonus - Cyberware] 1d6 => 5 = 5')).toEqual({
        source: 'Smart Pistol', type: 'BONUS', reason: 'Cyberware', notation: '1d6', faces: '5', subtotal: '5',
      });
    });

    it('returns the raw text when the line matches neither format', () => {
      expect(parseDamageTrackingLine('not a real line')).toEqual({ raw: 'not a real line' });
    });
  });

  describe('parseDamageTrackingMessage', () => {
    it('returns null for a message that is not a damage-tracking block', () => {
      expect(parseDamageTrackingMessage('just a normal chat message')).toBeNull();
    });

    it('parses a header with a tone label, delegating tone resolution to resolveTone', () => {
      const msg = 'DAMAGE TRACKING :: MELEE :: ROOK\nWolvers :: BASE :: 3d6+2 :: ROLLS 4, 5, 6 :: SUBTOTAL 17\nTOTAL :: 17';
      const resolveTone = (label) => ({ label, color: '#fff', rgb: '1,2,3' });
      expect(parseDamageTrackingMessage(msg, { resolveTone })).toEqual({
        title: 'DAMAGE',
        actor: 'ROOK',
        toneLabel: 'MELEE',
        toneColor: '#fff',
        toneRgb: '1,2,3',
        total: '17',
        rows: [{ source: 'Wolvers', type: 'BASE', reason: '', notation: '3d6+2', faces: '4, 5, 6', subtotal: '17' }],
      });
    });

    it('parses a header with no tone label (older messages), passing an empty label to resolveTone', () => {
      const msg = 'DAMAGE TRACKING :: ROOK\nSmart Pistol :: BASE :: 2d6+2 :: ROLLS 4, 6 :: SUBTOTAL 12\nTOTAL :: 12';
      const resolveTone = (label) => ({ label, color: '#000', rgb: '0,0,0' });
      const result = parseDamageTrackingMessage(msg, { resolveTone });
      expect(result.actor).toBe('ROOK');
      expect(result.toneLabel).toBe('');
      expect(result.total).toBe('12');
    });

    it('defaults to an empty tone when no resolveTone is injected', () => {
      const msg = 'DAMAGE TRACKING :: MELEE :: ROOK\nWolvers :: BASE :: 3d6 :: ROLLS 4, 5, 6 :: SUBTOTAL 15\nTOTAL :: 15';
      expect(parseDamageTrackingMessage(msg).toneLabel).toBe('');
    });
  });
});
