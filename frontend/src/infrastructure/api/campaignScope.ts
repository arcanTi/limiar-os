export function campaignPath(campaignId: string, suffix: string): string {
  if (!campaignId) throw new Error('Selecione uma campanha antes de acessar o estado compartilhado');
  return '/campaigns/' + encodeURIComponent(campaignId) + suffix;
}
