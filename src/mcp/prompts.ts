export const prompts = [
  { name: "generate-skeleton-area", description: "Generate candidate topic nodes and rough prerequisite edges for an area." },
  { name: "expand-topic-slice", description: "Decompose a focused topic slice into child topics and relationships." },
  { name: "generate-knowledge-points", description: "Generate 3-6 observable knowledge points for each topic." },
  { name: "critique-area", description: "Identify missing topics, duplicates, bad prerequisites, and broad nodes." }
];

export function getPrompt(name: string, args: Record<string, unknown>) {
  return {
    description: prompts.find((prompt) => prompt.name === name)?.description ?? name,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Use the curriculum graph workflow for ${name}. First call get_schema and get_area_map with these arguments, then return a patch or critique only: ${JSON.stringify(args)}`
        }
      }
    ]
  };
}
