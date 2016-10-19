import * as path from "path";
import * as minimatch from "minimatch";
import * as constants from "../constants";
import Future = require("fibers/future");

export class AppFilesUpdater {
	constructor(
		private appSourceDirectoryPath: string,
		private appDestinationDirectoryPath: string,
		public options: IOptions,
		public fs: IFileSystem
	) {
	}

	public updateApp(beforeCopyAction: (sourceFiles: string[]) => void): void {
		this.cleanDestinationApp();
		const sourceFiles = this.resolveAppSourceFiles();

		beforeCopyAction(sourceFiles);
		this.copyAppSourceFiles(sourceFiles);
	}

	public cleanDestinationApp(): void {
		if (this.options.bundle) {
			//Assuming an the bundle has updated the dest folder already.
			//Skip cleaning up completely.
			return;
		}

		// Delete the destination app in order to prevent EEXIST errors when symlinks are used.
		let destinationAppContents = this.readDestinationDir();
		destinationAppContents = destinationAppContents.filter(
			(directoryName: string) => directoryName !== constants.TNS_MODULES_FOLDER_NAME);

		_(destinationAppContents).each((directoryItem: string) => {
			this.deleteDestinationItem(directoryItem);
		});
	}

	protected readDestinationDir(): string[] {
		if (this.fs.exists(this.appDestinationDirectoryPath).wait()) {
			return this.fs.readDirectory(this.appDestinationDirectoryPath).wait();
		} else {
			return [];
		}
	}

	protected deleteDestinationItem(directoryItem: string): void {
		this.fs.deleteDirectory(path.join(this.appDestinationDirectoryPath, directoryItem)).wait();
	}

	protected readSourceDir(): string[] {
		return this.fs.enumerateFilesInDirectorySync(this.appSourceDirectoryPath, null, { includeEmptyDirectories: true });
	}

	protected resolveAppSourceFiles(): string[] {
		// Copy all files from app dir, but make sure to exclude tns_modules
		let sourceFiles = this.readSourceDir();

		if (this.options.release) {
			let testsFolderPath = path.join(this.appSourceDirectoryPath, 'tests');
			sourceFiles = sourceFiles.filter(source => source.indexOf(testsFolderPath) === -1);
		}

		// Remove .ts and .js.map files in release
		if (this.options.release) {
			constants.LIVESYNC_EXCLUDED_FILE_PATTERNS.forEach(pattern => sourceFiles = sourceFiles.filter(file => !minimatch(file, pattern, { nocase: true })));
		}

		if (this.options.bundle) {
			sourceFiles = sourceFiles.filter(file => minimatch(file, "**/App_Resources/**", {nocase: true}));
		}
		return sourceFiles;
	}

	protected copyAppSourceFiles(sourceFiles: string[]): void {
		let copyFileFutures = sourceFiles.map(source => {
			let destinationPath = path.join(this.appDestinationDirectoryPath, path.relative(this.appSourceDirectoryPath, source));
			if (this.fs.getFsStats(source).wait().isDirectory()) {
				return this.fs.createDirectory(destinationPath);
			}
			return this.fs.copyFile(source, destinationPath);
		});
		Future.wait(copyFileFutures);
	}
}
