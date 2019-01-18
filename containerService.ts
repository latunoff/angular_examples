import { QUEUEID_ALLOWED } from '../definitions/queueGroup';
import { localizeFilter_t } from '../filters/localize';
import { eDelays } from './../constants/eDelays';
import { eAngularEvents, ePushEvents } from './../constants/eEvents';
import { keys } from './../constants/keys';
import { CONTAINERID_ACTIVE, CONTAINERID_EDITABLE_ACTIVE, CONTAINERID_FINISHED, CONTAINERID_HDD, CONTAINERID_HOLD, CONTAINERID_SECURE, CONTAINERNAME_HDD_PUBLIC, Container, IRipContainer, IRipContainerList, containerId_t, eContainerBoxType, eContainerLock, eContainerType } from './../definitions/container/container';
import { DebugSrv } from './debugSrv';
import { DeviceSrv } from './deviceSrv';
import { DialogSrv } from './dialogSrv';
import { FcgiError, FcgiSrv } from './fcgiSrv';
import { LocalizationSrv } from './localizationSrv';
import { ReadyDeferred } from './readyDeferred';
import { UnitsSrv, eRipAfterUpload } from './unitsSrv';
import { UsersSrv } from './usersSrv';


const SCHEMA               = require('../schemas/containerList.schema.json');
const URL_LOAD             = '/containers.fcgi';
const URL_UNLOCK           = '/containerUnlock.fcgi';
const URL_LOCK             = '/containerLock.fcgi';
const URL_SETPASSWORD      = '/containerSetPassword.fcgi';
const URL_CREATE_CONTAINER = '/containerCreate.fcgi';
const URL_RENAME_CONTAINER = '/containerRename.fcgi';
const URL_DELETE_CONTAINER = '/containerDelete.fcgi';

const FOLDERBOXCOUNT_MAX:     number = 1000; // Maximum number of boxes for an HDD folder
const HDDFOLDER_JOBCOUNT_MAX: number = 100;
const HDDBOX_JOBCOUNT_MAX:    number = 1000;
const SECUREBOX_JOBCOUNT_MAX: number = 1000;

const STORAGEKEY = 'containersLastAccess';


interface RipContainerData
{
    containerId:    containerId_t;
}

interface AddedRipContainerData extends IRipContainer
{
    parentContainerId: containerId_t;
}

interface ContainerChangePushData
{
    changed: RipContainerData[];
    deleted: RipContainerData[];
    new:     AddedRipContainerData[];
}

export class ContainerSrv extends ReadyDeferred
{
    private containers:              Container[];
    private lastContainerChangePush: Date;
    private loadPromise:             ng.IPromise<void>;
    private loadTimeoutPromise:      ng.IPromise<void>;

    static $inject = ['$q', '$rootScope', '$timeout',
        'debugSrv', 'deviceSrv', 'dialogSrv', 'fcgiSrv', 'localizationSrv', 'usersSrv', 'localizeFilter', 'unitsSrv'];
    constructor($q:                      ng.IQService,
                private $rootScope:      ng.IRootScopeService,
                private $timeout:        ng.ITimeoutService,
                private debugSrv:        DebugSrv,
                private deviceSrv:       DeviceSrv,
                private dialogSrv:       DialogSrv,
                private fcgiSrv:         FcgiSrv,
                private localizationSrv: LocalizationSrv,
                private usersSrv:        UsersSrv,
                private localizeFilter:  localizeFilter_t,
                private unitsSrv:        UnitsSrv)
    {
        super($q);

        this.containers              = [];
        this.lastContainerChangePush = new Date(0) ;

        this.localizationSrv.isReadyPromise().then(() => this.load())
        .then(() => this.resolve())
        .catch(() => this.reject());

        this.$rootScope.$on(eAngularEvents.JOBLIST_CHANGED, (_ev, _containerId, fromWebSocket) => this.onJobListChanged(fromWebSocket));
        this.$rootScope.$on(eAngularEvents.LOGIN,           () => this.load());
        this.$rootScope.$on(eAngularEvents.LOGOUT,          () => this.load());
        this.$rootScope.$on(eAngularEvents.SOCKET_CLOSED,   () => this.load());

        this.$rootScope.$on(ePushEvents.CONTAINER_CHANGE, (_ev, data) => this.onPushedContainerChange(data));
        this.$rootScope.$on(ePushEvents.DB_INITIALIZATION_READY, () => this.load());

        // last access time object keeps growing with every container, so we clear it whenever we load as new.
        localStorage.removeItem(STORAGEKEY);
    }



    private fromLocalStorage(): { [id: number]: number }
    {
        let lastAccess: { [id: number]: number };
        try
        {
            lastAccess = JSON.parse(localStorage.getItem(STORAGEKEY) as string) || {};
        }
        catch (ex)
        {
            lastAccess = {};
        }
        return lastAccess;
    }

    private getLastAccess(container: Container): number
    {
        const lastAccess = this.fromLocalStorage();
        return lastAccess[container.getId()] || 0;
    }

    private getUpdatedContainers(ripContainers: IRipContainer[], parent?: Container): [Container[], boolean]
    {
        let changed = false;
        const tempContainers: Container[] = [];

        ripContainers.forEach(ripContainer =>
        {
            let container = this.getContainer(ripContainer.containerId);
            if (container != undefined)
            {
                if (container.update(ripContainer))
                {
                    changed = true;
                    this.$rootScope.$broadcast(eAngularEvents.CONTAINER_CHANGED, container);
                }
            }
            else
            {
                container = new Container(ripContainer);
                changed = true;
            }

            container.clearChildren();

            if (parent != undefined)
            {
                container.setParent(parent);
                parent.addChild(container);
            }

            tempContainers.push(container);

            if (ripContainer.containerList != undefined && ripContainer.containerList.length > 0)
            {
                const ret = this.getUpdatedContainers(ripContainer.containerList, container);
                if (ret[1])
                    changed = true;
                tempContainers.push(...ret[0]);
            }
        });

        return [tempContainers, changed];
    }

    private internalAddContainers(data: AddedRipContainerData[]): void
    {
        const updateContainers: RipContainerData[] = [];
        data.forEach(ripContainer =>
        {
            if (this.containers.findIndex(item => item.getId() == ripContainer.containerId) >= 0)
            {
                // Skip the container for adding: We already have it and should simply update it
                updateContainers.push(ripContainer);
                return;
            }
            const container = new Container(ripContainer);
            const parent = this.containers.find(item => item.getId() == ripContainer.parentContainerId);
            if (parent)
            {
                container.setParent(parent);
                parent.addChild(container);
            }
            this.containers.push(container);
        });
        if (updateContainers.length > 0)
            this.internalChangeContainers(updateContainers);
    }

    private internalChangeContainers(data: RipContainerData[]): void
    {
        data.forEach(ripContainer =>
        {
            const container = this.containers.find(item => item.getId() == ripContainer.containerId);
            if (container != undefined)
            {
                if (container.update(ripContainer as IRipContainer))
                    this.$rootScope.$broadcast(eAngularEvents.CONTAINER_CHANGED, container);
            }
        });
    }

    private internalDeleteContainers(data: RipContainerData[]): void
    {
        data.forEach(ripContainer =>
        {
            const container = this.containers.find(item => item.getId() == ripContainer.containerId);
            if (container != undefined)
            {
                const parent = container.getParent();
                if (parent != undefined)
                    parent.removeChild(container);

                const idx = this.containers.indexOf(container);
                if (idx != -1)
                    this.containers.splice(idx, 1);
            }
        });
    }

    private isPublicFolder(container: Container): boolean
    {
        const parent = container.getParent();
        return parent != undefined
            && parent.getId() == CONTAINERID_HDD
            && container.getName() == CONTAINERNAME_HDD_PUBLIC;
    }

    private isUserFolder(container: Container): boolean
    {
        const user = this.usersSrv.getUser();
        return user != undefined
            && !user.nonAuth
            && container.getName() == user.username
            && container.getBoxType() == eContainerBoxType.folder;
    }

    private load(): ng.IPromise<void>
    {
        if (this.loadPromise != undefined)
            return this.loadPromise;

        this.$timeout.cancel(this.loadTimeoutPromise);
        delete this.loadTimeoutPromise;

        this.loadPromise = this.lockUnusedContainers()
        .then(() => this.fcgiSrv.get(URL_LOAD, undefined, SCHEMA, QUEUEID_ALLOWED))
        .then((response: IRipContainerList) => this.updateContainers(response.containerList))
        .catch((fcgiError: FcgiError) => fcgiError.handle())
        .finally(() =>
        {
            this.loadTimeoutPromise = this.$timeout(() => { this.load(); }, eDelays.POLL_CONTAINERS);
            delete this.loadPromise;
        });

        return this.loadPromise;
    }

    private lockUnusedContainers(): ng.IPromise<void>
    {
        const now = new Date();

        const deferred = this.$q.defer();
        deferred.resolve();

        let containers = this.containers.filter(container => container.getLocked() == eContainerLock.off
            && now.getTime() - this.getLastAccess(container) > eDelays.TIMEOUT_CONTAINER_LOCK);

        const doLock = (): ng.IPromise<void> =>
        {
            if (containers.length == 0)
                return this.$q.resolve();

            const container = containers[0];
            return this.simpleLock(container)
            .then(() =>
            {
                // when a container is locked, it is removed from the list and all its descendants as well,
                // because they are not accessible anymore and thus cannot be locked
                containers = containers.filter(item => item != container && !item.isDescendant(container));
                doLock();
            });
        };
        return doLock();
    }

    private onJobListChanged(fromWebSocket: boolean): void
    {
        if (fromWebSocket)
            return;

        const now = new Date();
        if (now.getTime() - this.lastContainerChangePush.getTime() > eDelays.CHANGE_AFTER_PUSH_TRESHOLD)
            this.load();
    }

    private onPushedContainerChange(data: ContainerChangePushData): void
    {
        this.lastContainerChangePush = new Date();

        this.internalAddContainers(data.new);
        this.internalChangeContainers(data.changed);
        this.internalDeleteContainers(data.deleted);

        this.sortContainers();

        this.$rootScope.$broadcast(eAngularEvents.CONTAINERLIST_CHANGED, true);
    }

    private simpleLock(container: Container): ng.IPromise<void>
    {
        const params = { containerId: container.getId() };
        return this.fcgiSrv.post(URL_LOCK, { params })
        .then(() =>
        {
            container.setLocked(eContainerLock.on);
            this.$rootScope.$broadcast(eAngularEvents.CONTAINER_CHANGED, container);
        });
    }

    /**
     * Sorts the containers array.
     */
    private sortContainers(): void
    {
        const list = [...this.containers];
        this.containers.length = 0;
        list.forEach(item =>
        {
            if (item.getParent() == undefined)
                this.containers.push(item, ...this.sortSubContainers(item));
        });
    }

    private sortSubContainers(container: Container): Container[]
    {
        const array: Container[] = [];
        container.sortChildren().forEach(item => array.push(item, ...this.sortSubContainers(item)));
        return array;
    }

    private updateContainers(ripContainers: IRipContainer[]): void
    {
        const ret = this.getUpdatedContainers(ripContainers);
        const tempContainers = ret[0];
        let changed = ret[1];

        if (!changed)
            changed = this.containers.find(oc => tempContainers.find(nc => nc.getId() == oc.getId()) == undefined) != undefined;

        this.containers.length = 0;
        angular.extend(this.containers, tempContainers);

        this.sortContainers();

        if (changed)
            this.$rootScope.$broadcast(eAngularEvents.CONTAINERLIST_CHANGED, false);
    }



    public confirmDeleteContainer(container: Container)
    {
        let msg: string;
        if (container.getBoxType() == eContainerBoxType.box)
            msg = this.localizeFilter(keys.L10N_FRAME_CONTAINERLISTCONTEXTMENU_CONFIRMDELETEBOX_QUESTION
                    , container.getName());
        else if (container.getBoxType() == eContainerBoxType.folder)
            msg = this.localizeFilter(keys.L10N_FRAME_CONTAINERLISTCONTEXTMENU_CONFIRMDELETEFOLDER_QUESTION
                    , container.getName());
        else
            msg = this.localizeFilter(keys.L10N_FRAME_CONTAINERLISTCONTEXTMENU_CONFIRMDELETECONTAINER_QUESTION
                    , container.getName());

        const btnYes = {
                text: this.localizeFilter(keys.L10N_FRAME_CONTAINERLISTCONTEXTMENU_CONFIRMDELETE_YES, container.getName()),
                iconClass: 'icon-confirm-yes',
                defaultBtn: true,
            };
        const btnNo = {
                text: this.localizeFilter(keys.L10N_FRAME_CONTAINERLISTCONTEXTMENU_CONFIRMDELETE_NO),
                iconClass: 'icon-confirm-no',
                closeBtn: true,
            };
        this.dialogSrv.showConfirmation(msg, [btnYes, btnNo])
        .then(result =>
        {
            if (result == btnYes)
                this.deleteContainer(container);
        });
    }

    public createContainer(parent: Container, name: string, password?: string): ng.IPromise<void>
    {
        const params = {
            containerId:       parent.getId(),
            containerName:     name,
            containerPassword: password
        };
        return this.fcgiSrv.post(URL_CREATE_CONTAINER, { params })
        .then(() =>
        {
            this.load()
            .then(() =>
            {
                const container = parent.getChildren().find(child => child.getName() == name);
                if (container != undefined)
                {
                    this.$rootScope.$broadcast(eAngularEvents.CONTAINER_CREATED, container);
                }
            });
        });
    }

    public deleteContainer(container: Container): ng.IPromise<void>
    {
        const params = { containerId: container.getId() };
        return this.fcgiSrv.post(URL_DELETE_CONTAINER, { params })
        .then(() => this.load());
    }

    public getActiveContainer(): Container
    {
        return this.getContainer(CONTAINERID_ACTIVE) as Container;
    }

    public getContainer(containerId: containerId_t): Container | undefined
    {
        return this.containers.find(item => item.getId() == containerId);
    }

    public getContainers(): Container[]
    {
        return this.containers;
    }

    public getCountMax(inContainer: Container): number | undefined
    {
        if (inContainer.getType() == eContainerType.secure)
        {
            return this.deviceSrv.getSecureBoxMax();
        }
        else if (inContainer.getType() == eContainerType.hdd)
        {
            if (inContainer.getId() == CONTAINERID_HDD)
                return this.deviceSrv.getHddFolderMax();

            return this.getFolderBoxCountMax();
        }
        else
            return 0;
    }

    public getCreatableContainerBoxType(container: Container): eContainerBoxType
    {
        const isHdd = container.getType() == eContainerType.hdd;
        const isSecure = container.getType() == eContainerType.secure;
        if (isSecure)
            return eContainerBoxType.box;
        else if (isHdd)
            return container.getId() == CONTAINERID_HDD ? eContainerBoxType.folder : eContainerBoxType.box;
        else
            return eContainerBoxType.none;
    }

    public getEditableActiveContainer(): Container
    {
        return this.getContainer(CONTAINERID_EDITABLE_ACTIVE) as Container;
    }

    public getFinishedContainer(): Container
    {
        return this.getContainer(CONTAINERID_FINISHED) as Container;
    }

    public getFolderBoxCountMax()
    {
        return FOLDERBOXCOUNT_MAX;
    }

    public getHoldContainer(): Container
    {
        return this.getContainer(CONTAINERID_HOLD) as Container;
    }

    public getNewContainerBoxType(inContainer: Container): eContainerBoxType
    {
        if (inContainer == undefined)
            return eContainerBoxType.none;

        if (inContainer.getType() == eContainerType.secure)
            return eContainerBoxType.box;

        else if (inContainer.getType() == eContainerType.hdd)
        {
            if (inContainer.getId() == CONTAINERID_HDD)
                return eContainerBoxType.folder;

            return eContainerBoxType.box;
        }
        else
            return eContainerBoxType.none; // Fallback value
    }

    public isContainerAtMaxJobs(container: Container): boolean
    {
        if (!container)
            return false;

        switch (container.getType())
        {
        case eContainerType.hdd:
            return container.getJobCount() >= (
                container.getBoxType() == eContainerBoxType.folder
                ? HDDFOLDER_JOBCOUNT_MAX
                : HDDBOX_JOBCOUNT_MAX
            );

        case eContainerType.hold:
            return this.unitsSrv.getRipAfterUpload() == eRipAfterUpload.alwaysRip ? this.deviceSrv.isHoldJobsLimitError()
                                                                                  : this.deviceSrv.isHoldJobsUnrippedError();

        case eContainerType.secure:
            if (container.getParent() == undefined)
                return true;
            return container.getJobCount() >= SECUREBOX_JOBCOUNT_MAX;

        default:
            return false;
        }
    }

    public isCreateContainerEnabled(container: Container): boolean
    {
        if (!container)
            return false;

        const parent = container.getParent();

        if ( container.getType() == eContainerType.hdd  && !this.deviceSrv.isUserAuthOff() && container.getParent() == undefined )
            return false;

        const max = this.getCountMax(container);
        return (container.getId() == CONTAINERID_SECURE
                || (container.getType() == eContainerType.hdd && (parent == undefined || parent.getParent() == undefined)))
            && this.usersSrv.canCreateUserBox()
            && container.getLocked() != eContainerLock.on
            && (max == undefined || container.getChildren().length < max);
    }

    public isDeleteContainerEnabled(container?: Container): boolean
    {
        if (container == undefined)
            return false;

        const parent = container.getParent();
        return (container.getType() == eContainerType.hdd || container.getType() == eContainerType.secure)
            && parent != undefined
            && container.getLocked() != eContainerLock.on // No deleting locked containers
            && container.getJobCount() == 0 // No deleting containers with jobs
            && container.getChildren().length == 0 // No deleting containers with child containers
            && !this.isPublicFolder(container)
            && !this.isUserFolder(container);
    }

    public isLockContainerEnabled(inContainer: Container)
    {
        return inContainer
                && inContainer.getLocked() == eContainerLock.off;
    }

    public isRenameContainerEnabled(container?: Container): boolean
    {
        if (container == undefined)
            return false;

        const parent = container.getParent();
        return container.getType() == eContainerType.hdd
            && container.getLocked() != eContainerLock.on
            && parent != undefined
            && !this.isPublicFolder(container)
            && !this.isUserFolder(container);
    }

    public isUnlockContainerEnabled(inContainer: Container)
    {
        return inContainer
                && inContainer.getLocked() == eContainerLock.on;
    }

    public isUploadEnabled(container: Container): boolean
    {
        if (container == undefined)
            return false;

        if (!this.usersSrv.canCreateUserBox() )
            return false;

        const containerType = container.getType();
        switch (containerType)
        {
        case eContainerType.active:
            return true;

        case eContainerType.activeHold:
            return false;

        case eContainerType.finished:
            return true;

        case eContainerType.hdd:
            return container.getLocked() != eContainerLock.on;

        case eContainerType.hold:
            return container.getLocked() != eContainerLock.on;

        case eContainerType.secure:
            if (container.getParent() == undefined)
                return false;
            return container.getLocked() != eContainerLock.on;

        default:
            this.debugSrv.assert(false, `Unknown container type ${containerType}`);
            return false;
        }
    }

    public lock(container: Container): ng.IPromise<void>
    {
        return this.simpleLock(container)
        .then(() => this.load());
    }

    public lockWithErrorHandling(container: Container): ng.IPromise<void>
    {
        return this.lock(container)
        .catch((fcgiError: FcgiError) =>
        {
            fcgiError.handle();
            let msg: string = this.localizeFilter(keys.L10N_CONTAINER_LOCK_FAILEDMSG);
            if (fcgiError.userMessage)
                msg += '\n' + fcgiError.userMessage;
            this.dialogSrv.showError(msg);
            return this.$q.reject(fcgiError);
        });
    }

    public renameContainer(container: Container, containerName: string): (ng.IPromise<any>)
    {
        const parent = container.getParent();
        if (parent != undefined && parent.getId() == CONTAINERID_HDD && container.getName() == CONTAINERNAME_HDD_PUBLIC)
        {
            this.debugSrv.assert(false, 'The Public container under HDD may not be renamed!');
            return this.$q.when(null);
        }
        const params = { containerId: container.getId(), containerName };
        return this.fcgiSrv.post(URL_RENAME_CONTAINER, { params })
        .then(response =>
        {
            this.load()
            .then(() =>
            {
                this.$rootScope.$broadcast(eAngularEvents.CONTAINER_RENAMED, container);
            });
            return response;
        });
    }

    public setLastAccess(container: Container): void
    {
        const lastAccess = this.fromLocalStorage();
        let currCont: Container | undefined = container;
        while (currCont)
        {
            lastAccess[currCont.getId()] = new Date().getTime();
            currCont = currCont.getParent();
        }
        localStorage.setItem(STORAGEKEY, JSON.stringify(lastAccess));
    }

    public setPassword(container: Container, oldPassword: string, newPassword: string): (ng.IPromise<any>)
    {
        const params = { containerId: container.getId(), oldPassword, newPassword };
        return this.fcgiSrv.post(URL_SETPASSWORD, { params });
    }

    public unlock(container: Container, password: string): (ng.IPromise<boolean>)
    {
        const params = { containerId: container.getId(), containerPassword: password };
        return this.fcgiSrv.post(URL_UNLOCK, { params })
        .then(response =>
        {
            // Unlock is accessing the locked container, even if not shown (like in the store dialog).
            this.setLastAccess(container);
            this.load();
            return response;
        });
    }
}
