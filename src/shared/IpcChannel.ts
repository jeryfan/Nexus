/** Electron IPC channels still exposed by the model-management application. */
export enum IpcChannel {
  Application_PreventQuit = 'application:prevent-quit',
  Application_AllowQuit = 'application:allow-quit',
  Application_Relaunch = 'application:relaunch',
  App_LogToMain = 'app:log-to-main',

  NativeCommandPopupMenu_Show = 'native-command-popup-menu:show',

  File_Select = 'file:select',
  File_GetMetadata = 'file:getMetadata',
  File_CreateInternalEntry = 'file:createInternalEntry',
  File_EnsureExternalEntry = 'file:ensureExternalEntry',
  File_GetPhysicalPath = 'file:getPhysicalPath',
  File_PermanentDelete = 'file:permanentDelete',
  File_RunSweep = 'file:runSweep',
  File_TreeCreate = 'file:tree:create',
  File_TreeDispose = 'file:tree:dispose',
  File_TreeRename = 'file:tree:rename',
  File_TreeMutation = 'file:tree:mutation',

  Preference_Get = 'preference:get',
  Preference_Set = 'preference:set',
  Preference_GetMultipleRaw = 'preference:get-multiple-raw',
  Preference_SetMultiple = 'preference:set-multiple',
  Preference_GetAll = 'preference:get-all',
  Preference_Subscribe = 'preference:subscribe',
  Preference_Changed = 'preference:changed',

  Cache_Sync = 'cache:sync',
  Cache_GetAllShared = 'cache:get-all-shared',

  DataApi_Request = 'data-api:request',
  DataApi_DataChanged = 'data-api:data-changed',

  IpcApi_Request = 'ipc-api:request',
  IpcApi_Event = 'ipc-api:event'
}
