import knowledgeBase from '../data/knowledge_base.json';

interface KnowledgeCase {
  id: string;
  prompt: string;
  output: {
    react?: string;
    css?: string;
    html?: string;
    js?: string;
  };
}

interface ScoredCase extends KnowledgeCase {
  similarity: number;
}

const calculateSimilarity = (text1: string, text2: string): number => {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  let matchCount = 0;
  for (const word of words1) {
    if (words2.includes(word) && word.length > 1) {
      matchCount++;
    }
  }

  return matchCount / Math.max(words1.length, words2.length);
};

export const retrieveSimilarCases = (query: string, topK: number = 3): KnowledgeCase[] => {
  if (!query || query.trim() === '') {
    return [];
  }

  const scoredCases: ScoredCase[] = (knowledgeBase as KnowledgeCase[]).map(case_ => ({
    ...case_,
    similarity: calculateSimilarity(query, case_.prompt)
  }));

  scoredCases.sort((a, b) => b.similarity - a.similarity);

  return scoredCases.slice(0, topK).filter(c => c.similarity > 0);
};

export const getRandomCases = (count: number = 3): KnowledgeCase[] => {
  const shuffled = [...(knowledgeBase as KnowledgeCase[])].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const getCaseById = (id: string): KnowledgeCase | undefined => {
  return (knowledgeBase as KnowledgeCase[]).find(case_ => case_.id === id);
};

export default {
  retrieveSimilarCases,
  getRandomCases,
  getCaseById
};
