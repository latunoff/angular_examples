import { QUEUEID_ALLOWED } from '../definitions/queueGroup';
import { eDelays } from './../constants/eDelays';
import { eAngularEvents, ePushEvents } from './../constants/eEvents';
import { Box } from './../definitions/consumables/box';
import { Cartridge } from './../definitions/consumables/cartridge';
import { Ink } from './../definitions/consumables/ink';
import { DeviceInfo, eAutoDeleteJobSetting, IRipDeviceInfo, IRipStoredJobInformation, IUserAuthInformation } from './../definitions/deviceInfo';
import { eBannerTrayUnit, eBinder, eCreasingUnit, eEnvelopeFusingUnit, eHumidifierUnit, eLargePostInserter, eMultiFolder, eMultiHolePunch, eOutputTrayUnit, ePaperSources, ePostInserter, ePunchUnit, eRelayUnit, eRingBinder, eSaddleStitcher, eSaddleUnit, eScannerUnit, eSquareFoldUnit, eStacker, eStapler, eThirdPartyFinisher, eTrimUnit, IRipinstallableOption, POSTCARDFULLBLEEDENABLED_INSTALLED } from './../definitions/installableOption';
import { Job } from './../definitions/job/job';
import { eLevelPrinterStatus } from './../definitions/printerStatus/levelPrinterStatus';
import { eMainPrinterStatus } from './../definitions/printerStatus/mainPrinterStatus';
import { PrinterStatus } from './../definitions/printerStatus/printerStatus';
import { ePrinterSubstatus, PrinterSubstatus } from './../definitions/printerStatus/printerSubstatus';
import { eAppeInterpreterEnabled, mapAppeInterpreterEnabled } from './../definitions/printFeatures/printFeatures';
import { eInputTray } from './../definitions/printFeatures/trayFeatures';
import { isPITrayValue, Tray } from './../definitions/tray/tray';
import { DebugSrv } from './debugSrv';
import { FcgiError, FcgiSrv } from './fcgiSrv';
import { ReadyDeferred } from './readyDeferred';
import { refreshWeb } from './utilsSrv';


export enum eScreenTypeNameDot
{
    None    = 'None',
    Dot270  = 'Dot270',
    Dot210  = 'Dot210',
    Dot190  = 'Dot190',
    Dot175  = 'Dot175',
    Dot150  = 'Dot150',
    Dot130  = 'Dot130',
    Line200 = 'Line200',
    Line180 = 'Line180',
    Line150 = 'Line150',
    Dot170  = 'Dot170',
    Dot140  = 'Dot140',
    Dot120  = 'Dot120',
    Dot105  = 'Dot105',
    Dot085  = 'Dot085',
}


export enum eScreenTypeNameImageError
{
    None,
    FM1,
    FM2,
    FM3
}
export type sScreenTypeNameImageError = 'None' | 'FM1' | 'FM2' | 'FM3';


const URL_LOAD = '/initState.fcgi';
const SCHEMA = require('../schemas/deviceInfo.schema.json');

const HOLDJOBS_WARNING_LIMIT_PERCENTAGE: number = 0.9;
const HOLDJOBSNORIPPED_WARNING_LIMIT_PERCENTAGE: number = 0.9;
const SECUREBOXCOUNT_WARNING_LIMIT_PERCENTAGE: number = 0.9;
const HDDFOLDERCOUNT_WARNING_LIMIT_PERCENTAGE: number = 0.9;

const screenTypeNameImageDotMap: { [name: string]: eScreenTypeNameDot } = {
    None: eScreenTypeNameDot.None,
    Dot270: eScreenTypeNameDot.Dot270,
    Dot210: eScreenTypeNameDot.Dot210,
    Dot190: eScreenTypeNameDot.Dot190,
    Dot175: eScreenTypeNameDot.Dot175,
    Dot150: eScreenTypeNameDot.Dot150,
    Dot130: eScreenTypeNameDot.Dot130,
    Line200: eScreenTypeNameDot.Line200,
    Line180: eScreenTypeNameDot.Line180,
    Line150: eScreenTypeNameDot.Line150,
};

const screenTypeNameImageErrorMap: { [name: string]: eScreenTypeNameImageError } = {
    None: eScreenTypeNameImageError.None,
    FM1: eScreenTypeNameImageError.FM1,
    FM2: eScreenTypeNameImageError.FM2,
    FM3: eScreenTypeNameImageError.FM3,
};

const screenTypeNameTextGraphicsDotMap: { [name: string]: eScreenTypeNameDot } = {
    None: eScreenTypeNameDot.None,
    Dot270: eScreenTypeNameDot.Dot270,
    Dot210: eScreenTypeNameDot.Dot210,
    Dot190: eScreenTypeNameDot.Dot190,
    Dot175: eScreenTypeNameDot.Dot175,
    Dot150: eScreenTypeNameDot.Dot150,
    Dot130: eScreenTypeNameDot.Dot130,
    Line200: eScreenTypeNameDot.Line200,
    Line180: eScreenTypeNameDot.Line180,
    Line150: eScreenTypeNameDot.Line150,
};
export class DeviceSrv extends ReadyDeferred
{
    private administratorMode:              boolean;
    private appeInterpreterEnabled:         eAppeInterpreterEnabled;
    private autoDeleteJobSetting:           eAutoDeleteJobSetting;
    private deviceInfo:                     DeviceInfo      = new DeviceInfo();
    private displayPrinterName:             string;
    private hotFolderEnabled:               boolean;
    private loadPromise:                    ng.IPromise<void>;
    private loadTimeoutPromise:             ng.IPromise<ng.IPromise<void>>;
    private postcardFullBleedEnabled:       boolean;
    private printerStatusOrderByPriority:   PrinterStatus[] = [];
    private screenTypeNameImageDot1:        eScreenTypeNameDot;
    private screenTypeNameImageDot2:        eScreenTypeNameDot;
    private screenTypeNameImageError:       eScreenTypeNameImageError;
    private screenTypeNameTextGraphicsDot1: eScreenTypeNameDot;
    private screenTypeNameTextGraphicsDot2: eScreenTypeNameDot;
    private sortedBoxes:                    Box[]           = [];
    private sortedCartridges:               Cartridge[]     = [];
    private sortedInks:                     Ink[]           = [];
    private zipAndPpmlUploadEnabled:        boolean;

    // installable options
    private bannerTrayUnit:     eBannerTrayUnit     = eBannerTrayUnit.None;
    private binder:             eBinder             = eBinder.None;
    private creasing:           eCreasingUnit       = eCreasingUnit.None;
    private envelopeFusing:     eEnvelopeFusingUnit = eEnvelopeFusingUnit.None;
    private scannerUnit:        eScannerUnit        = eScannerUnit.None;
    private humidifier:         eHumidifierUnit     = eHumidifierUnit.None;
    private largePostInserter:  eLargePostInserter  = eLargePostInserter.None;
    private multiFolder:        eMultiFolder        = eMultiFolder.None;
    private multiHolePunch:     eMultiHolePunch     = eMultiHolePunch.None;
    private outputTrayUnit:     eOutputTrayUnit     = eOutputTrayUnit.None;
    private paperSources:       ePaperSources       = ePaperSources.None;
    private postInserter:       ePostInserter       = ePostInserter.None;
    private punchUnit:          ePunchUnit          = ePunchUnit.None;
    private relay:              eRelayUnit          = eRelayUnit.None;
    private ringBinder:         eRingBinder         = eRingBinder.None;
    private saddleStitcher:     eSaddleStitcher     = eSaddleStitcher.None;
    private saddleUnit:         eSaddleUnit         = eSaddleUnit.None;
    private squareFold:         eSquareFoldUnit     = eSquareFoldUnit.None;
    private stacker:            eStacker            = eStacker.None;
    private stapler:            eStapler            = eStapler.None;
    private thirdPartyFinisher: eThirdPartyFinisher = eThirdPartyFinisher.None;
    private trim:               eTrimUnit           = eTrimUnit.None;

    private sswBuildtime:         number;
    private sswVersion:           string;
    private sswVersionFromStatic: boolean;
    private startupTs:            number;
    private userAuthAccountPwd:   boolean;
    private userAuthAccountUsr:   boolean;
    private userAuthAdmin:        boolean;
    private userAuthPublic:       boolean;
    private userAuthUser:         boolean;
    private userAuthExternal:     boolean;

    //  storedJobInformation
    private holdJobCount?:           number;
    private holdJobMax?:             number;
    private holdJobWithoutRipCount?: number;
    private holdJobWithoutRipMax?:   number;
    private hddFolderCount?:         number;
    private hddFolderMax?:           number;
    private secureBoxCount?:         number;
    private secureBoxMax?:           number;

    static $inject = ['$q', '$document', '$http', '$location', '$rootScope', '$timeout', 'orderByFilter',
        'debugSrv', 'fcgiSrv'];
    constructor($q:                    ng.IQService,
                private $document:     ng.IDocumentService,
                private $http:         ng.IHttpService,
                private $location:     ng.ILocationService,
                private $rootScope:    ng.IScope,
                private $timeout:      ng.ITimeoutService,
                private orderByFilter: ng.IFilterOrderBy,
                private debugSrv:      DebugSrv,
                private fcgiSrv:       FcgiSrv)
    {
        super($q);

        this.$http.get('/version')
            .then(response =>
            {
                if (response.data)
                    this.setSswVersion(response.data as string, true);
            });

        this.$http.get('/buildtime')
            .then(response => this.setSswBuildTime(parseInt(response.data as string, 10)));

        this.load()
        .then((r) => this.readyDeferred.resolve())
        .catch(() => this.readyDeferred.reject());

        this.$rootScope.$on(eAngularEvents.SOCKET_CLOSED, () => this.load());

        this.$rootScope.$on(ePushEvents.DEVICEINFORMATION_CHANGE, (_ev, data) => this.onPushedDeviceInformationChange(data));
        this.$rootScope.$on(ePushEvents.REBOOT, () => refreshWeb());

        this.displayPrinterName = this.$location.host();
        this.$document[0].title = `${this.displayPrinterName} - SiteManager`;
    }

    /**
     * It combines all the provided "functionBitmap"'s by the RIP
     * to get a total function map
     *
     * @private
     * @param {IRipInstalledFinisher[]} installedFinisher
     * @returns {number}
     *
     * @memberOf DeviceSrv
     */




    private isPrinterSubstatusTray(substatus: PrinterSubstatus, tray: Tray): boolean
    {
        switch (tray.getTrayId().getValue())
        {
            case eInputTray.Tray1:
                return substatus.getValue() == ePrinterSubstatus.tray1;
            case eInputTray.Tray2:
                return substatus.getValue() == ePrinterSubstatus.tray2;
            case eInputTray.Tray3:
                return substatus.getValue() == ePrinterSubstatus.tray3;
            case eInputTray.Tray4:
                return substatus.getValue() == ePrinterSubstatus.tray4;
            case eInputTray.Tray5:
                return substatus.getValue() == ePrinterSubstatus.tray5;
            case eInputTray.Tray6:
                return substatus.getValue() == ePrinterSubstatus.tray6;
            case eInputTray.Tray7:
                return substatus.getValue() == ePrinterSubstatus.tray7;
            case eInputTray.Tray8:
                return substatus.getValue() == ePrinterSubstatus.tray8;
            case eInputTray.Tray9:
                return substatus.getValue() == ePrinterSubstatus.tray9;
            case eInputTray.Tray10:
                return substatus.getValue() == ePrinterSubstatus.tray10;
            case eInputTray.Tray11:
                return substatus.getValue() == ePrinterSubstatus.tray11;
            case eInputTray.PITray1:
                return substatus.getValue() == ePrinterSubstatus.piTray1;
            case eInputTray.PITray2:
                return substatus.getValue() == ePrinterSubstatus.piTray2;
            case eInputTray.Feeder:
                return substatus.getValue() == ePrinterSubstatus.Feeder;
            case eInputTray.PIPFUTray1:
                return substatus.getValue() == ePrinterSubstatus.PIPFUTray1;
            case eInputTray.PIPFUTray2:
                return substatus.getValue() == ePrinterSubstatus.PIPFUTray2;
            case eInputTray.PIPFUTray3:
                return substatus.getValue() == ePrinterSubstatus.PIPFUTray3;

            case eInputTray.PBTray:
            // goes through
            default:
                return false;
        }
    }

    private onPushedDeviceInformationChange(data: Partial<IRipDeviceInfo>): void
    {
        this.update(data);
    }

    private setSswBuildTime(value: number): void
    {
        this.sswBuildtime = value;
    }

    private setSswVersion(value: string, fromStatic: boolean = false): void
    {
        // if reading the static version, or the read version came from the static one, or the version is still not read,
        // or the version has not changed, everything is allright.
        if (fromStatic
            || this.sswVersionFromStatic
            || this.sswVersion == undefined
            || this.sswVersion == value)
        {
            this.sswVersion = value;
            this.sswVersionFromStatic = fromStatic;
        }
        // otherwise, the dynamic read version is different than the lasr read dynamic version, so we should reload.
        else
            refreshWeb();
    }

    private setStartupTs(value: number): void
    {
        if (this.startupTs == undefined)
            this.startupTs = value;

        if (value != this.startupTs)
            refreshWeb();
    }

    private sortBoxes(): void
    {
        const sorted = this.orderByFilter(this.deviceInfo.getBoxes(),
            (box) => box.getBoxId().getValue());
        this.sortedBoxes.length = 0;
        angular.extend(this.sortedBoxes, sorted);
    }

    private sortCartridges(): void
    {
        const sorted = this.orderByFilter(this.deviceInfo.getCartridges(),
            (cartridge) => cartridge.getCartridgeId().getValue());
        this.sortedCartridges.length = 0;
        angular.extend(this.sortedCartridges, sorted);
    }

    private sortInks(): void
    {
        const sorted = this.orderByFilter(this.deviceInfo.getInks(),
            (ink) => ink.getInkId().getValue());
        this.sortedInks.length = 0;
        angular.extend(this.sortedInks, sorted);
    }

    private sortPrinterStatusOrderByPriority(): void
    {
        const sorted = this.orderByFilter(this.deviceInfo.getPrinterStatus(),
            (printerstatus) => printerstatus.getMainPrinterStatus().getValue());
        this.printerStatusOrderByPriority.length = 0;
        angular.extend(this.printerStatusOrderByPriority, sorted);
    }

    private update(data: Partial<IRipDeviceInfo>): void
    {
        let changed: boolean = false;

        if (data.printerInformation)
        {
            if (data.printerInformation.administratorMode != undefined
                && data.printerInformation.administratorMode != this.administratorMode)
            {
                if (this.administratorMode != undefined)
                {
                    // when going into administrator mode, a message is sent so that the jobSrv releases all locks and
                    // does a reload.
                    if (data.printerInformation.administratorMode == true)
                        this.$rootScope.$emit(eAngularEvents.ADMINISTRATORMODE_CHANGED);
                    // when going out of administrator mode the jobSrv is not yet working, so we reload directly from here.
                    else
                        refreshWeb();
                }

                this.administratorMode = data.printerInformation.administratorMode;
                changed = true;
            }

            if (data.printerInformation.isZipAndPpmlUploadEnabled != undefined
                && data.printerInformation.isZipAndPpmlUploadEnabled != this.zipAndPpmlUploadEnabled)
            {
                this.zipAndPpmlUploadEnabled = data.printerInformation.isZipAndPpmlUploadEnabled;
                changed = true;
            }

            const options = data.printerInformation.installableOption;
            if (options)
            {
                if (options.postcardFullBleedEnabled != undefined)
                {
                    const installed = options.postcardFullBleedEnabled == POSTCARDFULLBLEEDENABLED_INSTALLED;
                    if (installed != this.postcardFullBleedEnabled)
                    {
                        this.postcardFullBleedEnabled = installed;
                        changed = true;
                    }
                }

                const appeInterpreterEnabled = mapAppeInterpreterEnabled.getOption(data.printerInformation.installableOption.appeInterpreterEnabled);
                if (appeInterpreterEnabled != undefined && appeInterpreterEnabled != this.appeInterpreterEnabled)
                {
                    this.appeInterpreterEnabled = appeInterpreterEnabled;
                    changed = true;
                }

                const screenTypeNameImageDot1 = data.printerInformation.installableOption.screenTypeNameImageDot1;
                if (screenTypeNameImageDot1 != undefined && screenTypeNameImageDotMap[screenTypeNameImageDot1] != this.screenTypeNameImageDot1)
                {
                    this.screenTypeNameImageDot1 = screenTypeNameImageDotMap[screenTypeNameImageDot1];
                    changed = true;
                }

                const screenTypeNameImageDot2 = data.printerInformation.installableOption.screenTypeNameImageDot2;
                if (screenTypeNameImageDot2 != undefined && screenTypeNameImageDotMap[screenTypeNameImageDot2] != this.screenTypeNameImageDot2)
                {
                    this.screenTypeNameImageDot2 = screenTypeNameImageDotMap[screenTypeNameImageDot2];
                    changed = true;
                }

                const screenTypeNameImageError = data.printerInformation.installableOption.screenTypeNameImageError;
                if (screenTypeNameImageError != undefined && screenTypeNameImageErrorMap[screenTypeNameImageError] != this.screenTypeNameImageError)
                {
                    this.screenTypeNameImageError = screenTypeNameImageErrorMap[screenTypeNameImageError];
                    changed = true;
                }

                const screenTypeNameTextGraphicsDot1 = data.printerInformation.installableOption.screenTypeNameTextGraphicsDot1;
                if (screenTypeNameTextGraphicsDot1 != undefined && screenTypeNameTextGraphicsDotMap[screenTypeNameTextGraphicsDot1] != this.screenTypeNameTextGraphicsDot1)
                {
                    this.screenTypeNameTextGraphicsDot1 = screenTypeNameTextGraphicsDotMap[screenTypeNameTextGraphicsDot1];
                    changed = true;
                }

                const screenTypeNameTextGraphicsDot2 = data.printerInformation.installableOption.screenTypeNameTextGraphicsDot2;
                if (screenTypeNameTextGraphicsDot2 != undefined && screenTypeNameTextGraphicsDotMap[screenTypeNameTextGraphicsDot2] != this.screenTypeNameTextGraphicsDot2)
                {
                    this.screenTypeNameTextGraphicsDot2 = screenTypeNameTextGraphicsDotMap[screenTypeNameTextGraphicsDot2];
                    changed = true;
                }
            }

            if (data.printerInformation.autoDeleteJobSetting != undefined
                && data.printerInformation.autoDeleteJobSetting != this.autoDeleteJobSetting)
            {
                this.autoDeleteJobSetting = data.printerInformation.autoDeleteJobSetting;
                changed = true;
            }
        }

        if (this.deviceInfo.update(data))
            changed = true;

        this.sortBoxes();
        this.sortCartridges();
        this.sortInks();
        this.sortPrinterStatusOrderByPriority();

        if (data.printerInformation && data.printerInformation.installableOption)
            this.updateInstallableOptions(data.printerInformation.installableOption);
        if (data.sswVersion)
            this.setSswVersion(data.sswVersion);
        if (data.sswBuildTime)
            this.setSswBuildTime(data.sswBuildTime);
        if (data.startupTimeS)
            this.setStartupTs(data.startupTimeS);
        if (data.userAuthInformation)
            this.updateUserAuth(data.userAuthInformation);

        this.updateDisplayPrinterName();

        if (data.printerInformation
            && data.printerInformation.hotFolderEnabled != undefined
            && data.printerInformation.hotFolderEnabled != this.hotFolderEnabled)
        {
            this.hotFolderEnabled = data.printerInformation.hotFolderEnabled;
            changed = true;
        }

        if (data.storedJobInformation && this.updateStoredJobInformation(data.storedJobInformation))
            changed = true;

        if (changed)
            this.$rootScope.$broadcast(eAngularEvents.DEVICEINFO_CHANGED);
    }

    private updateDisplayPrinterName(): void
    {
        const name = this.deviceInfo.getPrinterName();
        const mac = this.deviceInfo.getMacAddress();
        if (!name || !mac)
            return;

        const macParts = mac.toUpperCase().split(':');
        this.debugSrv.assert(macParts.length == 6, `Wrong MAC address: ${mac}`);

        // If the printer has the "default" name, we do not update it.
        const defaultName = `KM${macParts[3]}${macParts[4]}${macParts[5]}`;
        if (name != defaultName && name != this.displayPrinterName)
        {
            this.displayPrinterName = name;
            this.$document[0].title = `${this.displayPrinterName} - `;
        }
    }

    private updateInstallableOptions(installableOption: IRipinstallableOption): void
    {
        // Banner Tray
        this.bannerTrayUnit = installableOption.bannerTrayUnit;

        // Binder
        this.binder = installableOption.binder;

        // Creasing
        this.creasing = installableOption.creasingUnit;

        // Envelope Fusing
        this.envelopeFusing = installableOption.envelopeFusingUnit;

        // Feeder
        this.scannerUnit = installableOption.scannerUnit;

        // Humidifier
        this.humidifier = installableOption.humidifierUnit;

        // LargePostInserter
        this.largePostInserter = installableOption.largePostInserter;

        // MultiFolder
        this.multiFolder = installableOption.multiFolder;

        // MultiHolePunch
        this.multiHolePunch = installableOption.multiHolePunch;

        // Output Tray
        this.outputTrayUnit = installableOption.outputTrayUnit;

        // PaperSources
        this.paperSources = installableOption.paperSources;

        // PostInserter
        this.postInserter = installableOption.postInserter;

        // PunchUnit
        this.punchUnit = installableOption.punchUnit;

        // Relay
        this.relay = installableOption.relayUnit;

        // RingBinder
        this.ringBinder = installableOption.ringBinder;

        // SaddleStitcher
        this.saddleStitcher = installableOption.saddleStitcher;

        // SaddleUnit
        this.saddleUnit = installableOption.saddleUnit;

        // Square Fold
        this.squareFold = installableOption.squareFoldUnit;

        // Stacker
        this.stacker = installableOption.stacker;

        // Stapler
        this.stapler = installableOption.stapler;

        // ThirdPartyFinisher
        this.thirdPartyFinisher = installableOption.thirdPartyFinisher;

        // Trim
        this.trim = installableOption.trimUnit;
    }

    private updateStoredJobInformation(data: IRipStoredJobInformation): boolean
    {
        let changed = false;

        if (data.holdJobCount != this.holdJobCount)
        {
            this.holdJobCount = data.holdJobCount;
            changed = true;
        }
        if (data.holdJobMax != this.holdJobMax)
        {
            this.holdJobMax = data.holdJobMax;
            changed = true;
        }
        if (data.holdJobWithoutRipCount != this.holdJobWithoutRipCount)
        {
            this.holdJobWithoutRipCount = data.holdJobWithoutRipCount;
            changed = true;
        }
        if (data.holdJobWithoutRipMax != this.holdJobWithoutRipMax)
        {
            this.holdJobWithoutRipMax = data.holdJobWithoutRipMax;
            changed = true;
        }
        if (data.hddFolderCount != this.hddFolderCount)
        {
            this.hddFolderCount = data.hddFolderCount;
            changed = true;
        }
        if (data.hddFolderMax != this.hddFolderMax)
        {
            this.hddFolderMax = data.hddFolderMax;
            changed = true;
        }
        if (data.secureBoxCount != this.secureBoxCount)
        {
            this.secureBoxCount = data.secureBoxCount;
            changed = true;
        }
        if (data.secureBoxMax != this.secureBoxMax)
        {
            this.secureBoxMax = data.secureBoxMax;
            changed = true;
        }
        return changed;
    }

    private updateUserAuth(obj: IUserAuthInformation): void
    {
        let updated: boolean = false;

        if (obj.accountName != undefined && obj.accountName != this.userAuthAccountUsr)
        {
            if (this.userAuthAccountUsr != undefined)
                updated = true;
            this.userAuthAccountUsr = obj.accountName;
        }

        if (obj.accountPassword != undefined && obj.accountPassword != this.userAuthAccountPwd)
        {
            if (this.userAuthAccountPwd != undefined)
                updated = true;
            this.userAuthAccountPwd = obj.accountPassword;
        }

        if (obj.admin != undefined && obj.admin != this.userAuthAdmin)
        {
            if (this.userAuthAdmin != undefined)
                updated = true;
            this.userAuthAdmin = obj.admin;
        }

        if (obj.public != undefined && obj.public != this.userAuthPublic)
        {
            if (this.userAuthPublic != undefined)
                updated = true;
            this.userAuthPublic = obj.public;
        }

        if (obj.user != undefined && obj.user != this.userAuthUser)
        {
            if (this.userAuthUser != undefined)
                updated = true;
            this.userAuthUser = obj.user;
        }

        if (obj.external != undefined && obj.external != this.userAuthExternal)
        {
            if (this.userAuthExternal != undefined)
            {
                if (obj.external == true)
                    this.$rootScope.$emit(eAngularEvents.EXTERNALAUTHENTICATIONMODE_CHANGED);
                else
                {
                    refreshWeb();
                    return;
                }
            }
            this.userAuthExternal = obj.external;
        }

        if (updated)
        refreshWeb();
    }


    public getAppeInterpreterEnabled()       { return this.appeInterpreterEnabled; }
    public getAutoDeleteJobSetting()         { return this.autoDeleteJobSetting; }
    public getBannerTrayUnit()               { return this.bannerTrayUnit; }
    public getBinder()                       { return this.binder; }
    public getCreasing()                     { return this.creasing; }
    public getDeviceInfo()                   { return this.deviceInfo; }
    public getDisplayPrinterName()           { return this.displayPrinterName; }
    public getEnvelopeFusing()               { return this.envelopeFusing; }
    public getScannerUnit()                  { return this.scannerUnit; }
    public getHddFolderCount()               { return this.hddFolderCount; }
    public getHddFolderMax()                 { return this.hddFolderMax; }
    public getHoldJobCount()                 { return this.holdJobCount; }
    public getHoldJobsMax()                  { return this.holdJobMax; }
    public getHoldJobWithoutRipCount()       { return this.holdJobWithoutRipCount; }
    public getHoldJobWithoutRipMax()         { return this.holdJobWithoutRipMax; }
    public getHumidifier()                   { return this.humidifier; }
    public getLargePostInserter()            { return this.largePostInserter; }
    public getMultiFolder()                  { return this.multiFolder; }
    public getMultiHolePunch()               { return this.multiHolePunch; }
    public getOutputTrayUnit()               { return this.outputTrayUnit; }
    public getPaperSources()                 { return this.paperSources; }
    public getPostInserter()                 { return this.postInserter; }
    public getPrinterStatusOrderByPriority() { return this.printerStatusOrderByPriority; }
    public getPunchUnit()                    { return this.punchUnit; }
    public getRelay()                        { return this.relay; }
    public getRingBinder()                   { return this.ringBinder; }
    public getSaddleStitcher()               { return this.saddleStitcher; }
    public getSaddleUnit()                   { return this.saddleUnit; }
    public getScreenTypeNameImageDot1()      { return this.screenTypeNameImageDot1; }
    public getScreenTypeNameImageDot2()      { return this.screenTypeNameImageDot2; }
    public getScreenTypeNameImageError()     { return this.screenTypeNameImageError; }
    public getScreenTypeNameTextGraphics1()  { return this.screenTypeNameTextGraphicsDot1; }
    public getScreenTypeNameTextGraphics2()  { return this.screenTypeNameTextGraphicsDot2; }
    public getSecureBoxCount()               { return this.secureBoxCount; }
    public getSecureBoxMax()                 { return this.secureBoxMax ; }
    public getSortedBoxes()                  { return this.sortedBoxes; }
    public getSortedCartridges()             { return this.sortedCartridges; }
    public getSortedInks()                   { return this.sortedInks; }
    public getSquareFold()                   { return this.squareFold; }
    public getSswBuildTime()                 { return this.sswBuildtime; }
    public getSswVersion()                   { return this.sswVersion; }
    public getStacker()                      { return this.stacker; }
    public getStapler()                      { return this.stapler; }
    public getThirdPartyFinisher()           { return this.thirdPartyFinisher; }
    public getTrim()                         { return this.trim; }
    public isAdministratorMode()             { return this.administratorMode; }

    public getFirstAvailablePostInserter(): eInputTray | undefined
    {
        const piTray = this.deviceInfo.getInputTrays().find(tray => tray.isPITray());
        if (piTray == undefined)
            return;
        return piTray.getTrayId().getValue();
    }

    public isControllerHDDNearFullWarning(): boolean
    {
        return this.getPrinterStatusOrderByPriority().some((status) =>
        {
            return status.getMainPrinterStatus().getValue() == eMainPrinterStatus.controllerHddNearFull
                && status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.warning;
        });
    }

    public isHotFolderEnabled()   { return this.hotFolderEnabled; }
    public isUserAuthAccountPwd() { return this.userAuthAccountPwd; }
    public isUserAuthAccountUsr() { return this.userAuthAccountUsr; }
    public isUserAuthAdmin()      { return this.userAuthAdmin; }
    public isUserAuthExternal()   { return this.userAuthExternal; }
    public isUserAuthPublic()     { return this.userAuthPublic; }
    public isUserAuthUser()       { return this.userAuthUser; }

    public isUserAuthOff()
    {
        return this.userAuthPublic && !this.userAuthUser;
    }

    public isFoldTabVisible(job: Job): boolean
    {
        return job.getFold().isVisible()
            && (this.getCreasing() != eCreasingUnit.None
                || this.getTrim() != eTrimUnit.None
                || this.getSquareFold() != eSquareFoldUnit.None
                || this.getRingBinder() != eRingBinder.None);
    }

    public isHoldJobsLimitError(): boolean
    {
        return this.getPrinterStatusOrderByPriority().some((status) =>
        {
            return status.getMainPrinterStatus().getValue() == eMainPrinterStatus.holdQueueFull
                && status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.warning;
        });
    }

    public isHoldJobsLimitReached(): boolean
    {
        return this.holdJobCount != undefined
            && this.holdJobMax != undefined
            && this.holdJobCount >= this.holdJobMax;
    }

    public isHoldJobsLimitWarning(): boolean
    {
        return this.holdJobCount != undefined
            && this.holdJobMax != undefined
            && this.holdJobCount > (this.holdJobMax * HOLDJOBS_WARNING_LIMIT_PERCENTAGE)
            && this.holdJobCount < this.holdJobMax;
    }

    public isHoldJobsUnrippedError(): boolean
    {
        return this.holdJobWithoutRipCount != undefined
            && this.holdJobWithoutRipMax != undefined
            && this.holdJobWithoutRipCount >= this.holdJobWithoutRipMax;
    }

    public isHoldJobsUnrippedWarning(): boolean
    {
        return this.holdJobWithoutRipCount != undefined
            && this.holdJobWithoutRipMax != undefined
            && this.holdJobWithoutRipCount > (this.holdJobWithoutRipMax * HOLDJOBSNORIPPED_WARNING_LIMIT_PERCENTAGE)
            && this.holdJobWithoutRipCount < this.holdJobWithoutRipMax;
    }

    public isHDDFullWarning(): boolean
    {
        return this.getPrinterStatusOrderByPriority().some((status) =>
        {
            return status.getMainPrinterStatus().getValue() == eMainPrinterStatus.engineHddNearFull
                && status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.warning;
        });
    }

    public isHddFolderCountError(): boolean
    {
        return this.getPrinterStatusOrderByPriority().some((status) =>
        {
            return status.getMainPrinterStatus().getValue() == eMainPrinterStatus.hddFolderFull
                && status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.warning;
        });
    }

    public isHddFolderCountWarning(): boolean
    {
        return this.hddFolderCount != undefined
            && this.hddFolderMax != undefined
            && this.hddFolderCount > (this.hddFolderMax * HDDFOLDERCOUNT_WARNING_LIMIT_PERCENTAGE)
            && this.hddFolderCount < this.hddFolderMax;
    }

    public isSecureBoxCountError(): boolean
    {
        return this.getPrinterStatusOrderByPriority().some((status) =>
        {
            return status.getMainPrinterStatus().getValue() == eMainPrinterStatus.secureBoxFull
                && status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.warning;
        });
    }

    public isSecureBoxCountWarning(): boolean
    {
        return this.secureBoxCount != undefined
            && this.secureBoxMax != undefined
            && this.secureBoxCount > (this.secureBoxMax * SECUREBOXCOUNT_WARNING_LIMIT_PERCENTAGE)
            && this.secureBoxCount < this.secureBoxMax;
    }

    public isPITrayAvailable(): boolean
    {
        return this.deviceInfo.getInputTrays().some((tray) =>
        {
            return isPITrayValue(tray.getTrayId().getValue());
        });
    }

    public isPaperAmountTrayError(tray: Tray): boolean
    {
        return this.deviceInfo.getPrinterStatus().some((status) =>
        {
            if (status.getMainPrinterStatus().getValue() == eMainPrinterStatus.noPaper
                && this.isPrinterSubstatusTray(status.getPrinterSubstatus(), tray))
                return true;
            else
                return false;
        });
    }

    public isPaperAmountTrayWarning(tray: Tray): boolean
    {
        return this.deviceInfo.getPrinterStatus().some((status) =>
        {
            if (status.getMainPrinterStatus().getValue() == eMainPrinterStatus.lowPaper
                && this.isPrinterSubstatusTray(status.getPrinterSubstatus(), tray))
                return true;
            else
                return false;
        });
    }

    public isPerfectBindTabVisible(): boolean
    {
        return this.getBinder() != eBinder.None
            && (this.getCreasing() != eCreasingUnit.None
                || this.getTrim() != eTrimUnit.None
                || this.isPITrayAvailable());
    }

    public isPostcardFullBleedEnabled(): boolean
    {
        return this.postcardFullBleedEnabled;
    }

    public isQualityTabVisible(): boolean
    {
        return this.relay == eRelayUnit.IQ_501_RU_510_518_518
            || this.relay == eRelayUnit.IQ_501_RU_510_518
            || this.relay == eRelayUnit.IQ_501_RU_518
            || this.relay == eRelayUnit.IQ_501_RU_518_518
            || this.relay == eRelayUnit.IQ_501_RU_510_518_518_702
            || this.relay == eRelayUnit.IQ_501_RU_518_518_702
            || this.relay == eRelayUnit.IQ_501_RU_510_518_702
            || this.relay == eRelayUnit.IQ_501_RU_518_702;
    }

    public isZipAndPpmlUploadEnabled(): boolean
    {
        return this.zipAndPpmlUploadEnabled;
    }

    public load(): ng.IPromise<void>
    {
        if (this.loadPromise != undefined)
            return this.loadPromise;

        this.$timeout.cancel(this.loadTimeoutPromise);
        delete this.loadTimeoutPromise;

        this.loadPromise = this.fcgiSrv.get(URL_LOAD, undefined, {}, QUEUEID_ALLOWED)
            .then((response: IRipDeviceInfo) => this.update(response))
            .catch((fcgiError: FcgiError) => fcgiError.handle())
            .finally(() =>
            {
                this.loadTimeoutPromise = this.$timeout(() => this.load(), eDelays.POLL_DEVICEINFO);
                delete this.loadPromise;
            });

        return this.loadPromise;
    }
}
