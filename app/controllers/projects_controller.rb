#-- encoding: UTF-8
#-- copyright
# OpenProject is a project management system.
# Copyright (C) 2012-2018 the OpenProject Foundation (OPF)
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2017 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See docs/COPYRIGHT.rdoc for more details.
#++

class ProjectsController < ApplicationController
  menu_item :overview
  menu_item :roadmap, only: :roadmap

  before_action :find_project, except: %i[index level_list new create]
  before_action :authorize, only: %i[update modules types custom_fields]
  before_action :authorize_global, only: %i[new create]
  before_action :require_admin, only: %i[archive unarchive destroy destroy_info]

  include SortHelper
  include PaginationHelper
  include CustomFieldsHelper
  include QueriesHelper
  include RepositoriesHelper
  include ProjectsHelper

  # Lists visible projects
  def index
    query = load_query
    set_sorting(query)

    unless query.valid?
      flash[:error] = query.errors.full_messages
    end

    @projects = load_projects query
    @custom_fields = ProjectCustomField.visible(User.current)

    respond_to do |format|
      format.html do
        render layout: 'no_menu'
      end
    end
  end

  current_menu_item :index do
    :list_projects
  end

  def new
    assign_default_create_variables

    render layout: 'no_menu'
  end

  current_menu_item :new do
    :new_project
  end

  def create
    assign_default_create_variables

    if validate_parent_id && @project.save
      @project.set_allowed_parent!(params['project']['parent_id']) if params['project'].has_key?('parent_id')
      add_current_user_to_project_if_not_admin(@project)
      respond_to do |format|
        format.html do
          flash[:notice] = l(:notice_successful_create)
          redirect_work_packages_or_overview
        end
      end
    else
      respond_to do |format|
        format.html { render action: 'new', layout: 'no_menu' }
      end
    end
  end

  def update
    @altered_project = Project.find(@project.id)

    # TODO: move the validation into the contract
    #       move setting the allowed parents to the service
    service = Projects::UpdateService
              .new(user: current_user,
                   model: @altered_project)

    if validate_parent_id && service.call(permitted_params.project).success?
      if params['project'].has_key?('parent_id')
        @altered_project.set_allowed_parent!(params['project']['parent_id'])
      end
      flash[:notice] = l(:notice_successful_update)
      OpenProject::Notifications.send('project_updated', project: @altered_project)
    end

    redirect_to settings_project_path(@altered_project)
  end

  def update_identifier
    @project.attributes = permitted_params.project

    if @project.save
      flash[:notice] = I18n.t(:notice_successful_update)
      redirect_to settings_project_path(@project)
      OpenProject::Notifications.send('project_renamed', project: @project)
    else
      render action: 'identifier'
    end
  end

  def types
    if UpdateProjectsTypesService.new(@project).call(permitted_params.projects_type_ids)
      flash[:notice] = l('notice_successful_update')
    else
      flash[:error] = @project.errors.full_messages
    end

    redirect_to settings_project_path(@project.identifier, tab: 'types')
  end

  def modules
    @project.enabled_module_names = permitted_params.project[:enabled_module_names]
    # Ensure the project is touched to update its cache key
    @project.touch
    flash[:notice] = I18n.t(:notice_successful_update)
    redirect_to settings_project_path(@project, tab: 'modules')
  end

  def custom_fields
    Project.transaction do
      @project.work_package_custom_field_ids = permitted_params.project[:work_package_custom_field_ids]
      if @project.save
        flash[:notice] = t(:notice_successful_update)
      else
        flash[:error] = t(:notice_project_cannot_update_custom_fields,
                          errors: @project.errors.full_messages.join(', '))
        raise ActiveRecord::Rollback
      end
    end
    redirect_to settings_project_path(@project, tab: 'custom_fields')
  end

  def archive
    projects_url = url_for(controller: '/projects', action: 'index', status: params[:status])
    if @project.archive
      redirect_to projects_url
    else
      flash[:error] = I18n.t(:error_can_not_archive_project)
      redirect_back fallback_location: projects_url
    end

    update_demo_project_settings @project, false
  end

  def unarchive
    @project.unarchive if !@project.active?
    redirect_to(url_for(controller: '/projects', action: 'index', status: params[:status]))
    update_demo_project_settings @project, true
  end

  # Delete @project
  def destroy
    service = ::Projects::DeleteProjectService.new(user: current_user, project: @project)
    call = service.call(delayed: true)

    if call.success?
      flash[:notice] = I18n.t('projects.delete.scheduled')
    else
      flash[:error] = I18n.t('projects.delete.schedule_failed', errors: call.errors.full_messages.join("\n"))
    end

    redirect_to controller: 'projects', action: 'index'
    update_demo_project_settings @project, false
  end

  def destroy_info
    @project_to_destroy = @project

    hide_project_in_layout
  end

  def level_list
    projects = Project.project_level_list(Project.visible)

    respond_to do |format|
      format.json { render json: projects_level_list_json(projects) }
    end
  end

  private

  def find_optional_project
    return true unless params[:id]

    @project = Project.find(params[:id])
    authorize
  rescue ActiveRecord::RecordNotFound
    render_404
  end

  def redirect_work_packages_or_overview
    return if redirect_to_project_menu_item(@project, :work_packages)

    redirect_to project_overview_path(@project)
  end

  def hide_project_in_layout
    @project = nil
  end

  def add_current_user_to_project_if_not_admin(project)
    unless User.current.admin?
      r = Role.givable.find_by(id: Setting.new_project_user_role_id.to_i) || Role.givable.first
      m = Member.new do |member|
        member.principal = User.current
        member.role_ids = [r].map(&:id) # member.roles = [r] fails, this works
      end
      project.members << m
    end
  end

  def load_query
    @query = ParamsToQueryService.new(Project, current_user).call(params)

    # Set default filter on status no filter is provided.
    @query.where('status', '=', Project::STATUS_ACTIVE.to_s) unless params[:filters]

    # Order lft if no order is provided.
    @query.order(lft: :asc) unless params[:sortBy]

    @query
  end

  def filter_projects_by_permission(projects)
    # Cannot simply use .visible here as it would
    # filter out archived projects for everybody.
    if User.current.admin?
      projects
    else
      projects.visible
    end
  end

  def assign_default_create_variables
    @issue_custom_fields = WorkPackageCustomField.order("#{CustomField.table_name}.position")
    @types = ::Type.all
    @project = Project.new
    @project.parent = Project.find(params[:parent_id]) if params[:parent_id]
    @project.attributes = permitted_params.project if params[:project].present?
  end

  protected

  def set_sorting(query)
    orders = query.orders.select(&:valid?).map { |o| [o.attribute.to_s, o.direction.to_s] }

    sort_clear
    sort_init orders
    sort_update orders.map(&:first)
  end

  def load_projects(query)
    filter_projects_by_permission(query.results)
      .with_required_storage
      .with_latest_activity
      .includes(:custom_values, :enabled_modules)
      .paginate(page: page_param, per_page: per_page_param)
  end

  # Validates parent_id param according to user's permissions
  # TODO: move it to Project model in a validation that depends on User.current
  def validate_parent_id
    return true if User.current.admin?

    parent_id = permitted_params.project && params[:project][:parent_id]
    if parent_id || @project.new_record?
      parent = parent_id.blank? ? nil : Project.find_by(id: parent_id.to_i)
      unless @project.allowed_parents.include?(parent)
        @project.errors.add :parent_id, :invalid
        return false
      end
    end
    true
  end

  def update_demo_project_settings(project, value)
    # e.g. when one of the demo projects gets deleted or a archived
    if project.identifier == 'your-scrum-project' || project.identifier == 'demo-project'
      Setting.demo_projects_available = value
    end
  end
end
