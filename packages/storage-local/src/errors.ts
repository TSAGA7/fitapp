export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class ValidationError extends StorageError {
  constructor(
    readonly store: string,
    readonly recordId: string | null,
    readonly issues: string[],
  ) {
    super(`Запись не прошла проверку (${store}${recordId ? `, ${recordId}` : ''}): ${issues.join('; ')}`);
  }
}
export class ImmutableVersionError extends StorageError {
  constructor(id: string) {
    super(`Версия программы ${id} неизменяема: можно только добавить новую версию`);
  }
}
export class ConfirmationRequiredError extends StorageError {
  constructor() {
    super('Импорт требует явного подтверждения пользователя');
  }
}
export class StalePreviewError extends StorageError {
  constructor() {
    super('Данные в приложении изменились после предпросмотра: построй предпросмотр заново');
  }
}
export class StorageTooNewError extends StorageError {
  constructor(readonly found: number | null, readonly supported: number) {
    super(`База данных создана более новой версией приложения (v${found ?? '?'}), эта версия понимает v${supported}. Обнови приложение.`);
  }
}
export class ExcelReadError extends StorageError {
  constructor(detail: string) {
    super(`Не удалось прочитать файл Excel: ${detail}`);
  }
}
export class InvalidBackupError extends StorageError {}
