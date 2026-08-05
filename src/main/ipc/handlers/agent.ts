import { application } from '@application'
import type { agentRequestSchemas } from '@shared/agent/schemas'
import type { IpcHandlersFor } from '@shared/ipc/types'

import type { AgentService } from '@main/agent'

function service(): AgentService {
  return application.get('AgentService')
}

export const agentHandlers: IpcHandlersFor<typeof agentRequestSchemas> = {
  'agent.workspace.pick': (input) => service().workspace.pick(input.defaultPath),
  'agent.workspace.getRecent': () => Promise.resolve(service().workspace.getRecent()),
  'agent.workspace.reveal': async (input) => {
    await service().workspace.reveal(input.path)
  },
  'agent.sessionLists.get': () => service().sessions.getSessionLists(),
  'agent.session.create': async (input) => {
    // cwd 缺省时创建对话：应用托管的独立工作区（~/Documents/.nexus/chats/<uuid>）
    const cwd = input.cwd ?? (await service().workspace.createChatWorkspace())
    const { sessionId } = await service().sessions.createSession(cwd, !input.cwd)
    return { sessionId, cwd }
  },
  'agent.session.open': (input) => service().sessions.openSession(input.sessionId),
  'agent.session.delete': async (input) => {
    const row = await service().sessions.deleteSession(input.sessionId)
    // 对话的独立工作区由应用托管，随删除回收（带 chats 根目录保护）
    if (row && !row.projectId) {
      await service().workspace.removeChatWorkspace(row.cwd)
    }
  },
  'agent.session.setPinned': async (input) => {
    service().sessions.setPinned(input.sessionId, input.pinned)
  },
  'agent.session.setArchived': async (input) => {
    service().sessions.setArchived(input.sessionId, input.archived)
  },
  'agent.project.setPinned': async (input) => {
    service().sessions.setProjectPinned(input.cwd, input.pinned)
  },
  'agent.project.setRemoved': async (input) => {
    service().sessions.setProjectRemoved(input.cwd, input.removed)
  },
  'agent.project.archiveSessions': async (input) => {
    await service().sessions.archiveProjectSessions(input.cwd)
  },
  'agent.session.prompt': async (input) => {
    await service().sessions.prompt(input.sessionId, input.text, input.images, input.thinkingLevel)
  },
  'agent.session.edit': async (input) => {
    await service().sessions.editUserMessage(input.sessionId, input.timestamp, input.text)
  },
  'agent.session.abort': async (input) => {
    await service().sessions.abort(input.sessionId)
  },
  'agent.model.listAvailable': () => service().modelRuntime.listAvailableModels(),
  'agent.model.set': async (input) => {
    await service().sessions.setModel(input.sessionId, {
      provider: input.provider,
      modelId: input.modelId
    })
  },
  'agent.artifact.open': async (input) => {
    await service().artifacts.open(service().sessions.getSessionCwd(input.sessionId), input.path)
  },
  'agent.package.list': () => service().resources.listPackages(),
  'agent.package.checkUpdates': () => service().resources.checkUpdates(),
  'agent.package.install': async (input) => {
    await service().resources.installPackage(input.source)
  },
  'agent.package.remove': async (input) => {
    await service().resources.removePackage(input.source)
  },
  'agent.package.update': async (input) => {
    await service().resources.updatePackage(input.source)
  },
  'agent.package.setEnabled': async (input) => {
    await service().resources.setBuiltinEnabled(input.source, input.enabled)
  },
  'agent.package.retryBuiltin': async () => {
    await service().resources.retryBuiltinReconcile()
  },
  'agent.package.pickLocalDir': async () => {
    // 与 workspace.pick 不同：不写入“最近工作区”缓存
    const { BrowserWindow, dialog } = await import('electron')
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog({
      ...(window ? { parent: window } : {}),
      properties: ['openDirectory']
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : { path }
  },
  'agent.mcp.list': () => Promise.resolve(service().mcp.list()),
  'agent.mcp.save': async (input) => {
    service().mcp.save(input.originalName, input.server)
  },
  'agent.mcp.setDisabled': async (input) => {
    service().mcp.setDisabled(input.name, input.disabled)
  },
  'agent.mcp.remove': async (input) => {
    service().mcp.remove(input.name)
  },
  'agent.skill.list': () => service().resources.listSkills(),
  'agent.skill.setEnabled': async (input) => {
    await service().resources.setSkillEnabled(input.filePath, input.enabled)
  },
  'agent.skill.reveal': async (input) => {
    const { shell } = await import('electron')
    shell.showItemInFolder(input.filePath)
  }
}
