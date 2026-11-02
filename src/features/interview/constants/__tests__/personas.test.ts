import { describe, it, expect } from 'vitest';

import {
  INTERVIEWERS,
  INTERVIEWERS_MAP,
  DEFAULT_INTERVIEWER,
  getInterviewerPersona,
  buildOpeningGreeting,
} from '../personas';

describe('Personas & Opening Greeting', () => {
  it('defines 4 standard enterprise interviewers', () => {
    expect(INTERVIEWERS).toHaveLength(4);
    expect(INTERVIEWERS.map((i) => i.id)).toEqual([
      'priya',
      'marcus',
      'elena',
      'david',
    ]);
    expect(INTERVIEWERS_MAP.priya).toBeDefined();
    expect(INTERVIEWERS_MAP.marcus).toBeDefined();
  });

  it('retrieves correct persona by id and falls back gracefully', () => {
    expect(getInterviewerPersona('marcus').name).toBe('Marcus');
    expect(getInterviewerPersona('elena').name).toBe('Elena');
    expect(getInterviewerPersona('david').name).toBe('David');
    expect(getInterviewerPersona('priya').name).toBe('Priya Nair');
    expect(getInterviewerPersona('unknown-id').name).toBe(
      DEFAULT_INTERVIEWER.name,
    );
    expect(getInterviewerPersona(undefined).name).toBe(
      DEFAULT_INTERVIEWER.name,
    );
  });

  it('generates tailored opening greeting for Elena with System Design context', () => {
    const greeting = buildOpeningGreeting({
      interviewerId: 'elena',
      role: 'Staff Infrastructure Engineer',
      experience: 'Staff+',
      difficulty: 'Hard',
      interviewType: 'System design',
      techStack: ['Kubernetes', 'Go', 'Kafka'],
    });

    expect(greeting).toContain('Elena');
    expect(greeting).toContain('Helix Systems');
    expect(greeting).toContain('System design');
    expect(greeting).toContain('Staff+');
    expect(greeting).toContain('Staff Infrastructure Engineer');
    expect(greeting).toContain('Kubernetes, Go, Kafka');
  });

  it('generates tailored opening greeting for Marcus with Technical context', () => {
    const greeting = buildOpeningGreeting({
      interviewerId: 'marcus',
      role: 'Backend Engineer',
      experience: 'Senior',
      difficulty: 'Medium',
      interviewType: 'Technical',
      techStack: ['Node.js', 'PostgreSQL'],
    });

    expect(greeting).toContain('Marcus');
    expect(greeting).toContain('Lumen Labs');
    expect(greeting).toContain('Technical');
    expect(greeting).toContain('Senior');
    expect(greeting).toContain('Backend Engineer');
    expect(greeting).toContain('Node.js, PostgreSQL');
  });

  it('generates tailored opening greeting for Priya with Full loop context', () => {
    const greeting = buildOpeningGreeting({
      interviewerId: 'priya',
      role: 'Frontend Engineer',
      experience: 'Junior',
      difficulty: 'Easy',
      interviewType: 'Full loop',
      techStack: ['React', 'CSS'],
    });

    expect(greeting).toContain('Priya Nair');
    expect(greeting).toContain('Northwind');
    expect(greeting).toContain('Full loop');
    expect(greeting).toContain('Junior');
    expect(greeting).toContain('Frontend Engineer');
    expect(greeting).toContain('React, CSS');
  });
});
